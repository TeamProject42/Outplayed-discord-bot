const {
    SlashCommandBuilder,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { getGame, getGameKeys } = require('../../utils/gameConstants');
const { generateUUID } = require('../../utils/helpers');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Tournament registration')
        .addSubcommand(sub =>
            sub.setName('tournament')
                .setDescription('Register your team for a tournament')
                .addStringOption(opt =>
                    opt.setName('tournament_id')
                        .setDescription('Tournament UUID')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('withdraw')
                .setDescription('Withdraw from a tournament')
                .addStringOption(opt =>
                    opt.setName('tournament_id')
                        .setDescription('Tournament UUID')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Check your registration status')
                .addStringOption(opt =>
                    opt.setName('tournament_id')
                        .setDescription('Tournament UUID')
                        .setRequired(true))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'tournament': return handleRegister(interaction);
            case 'withdraw': return handleWithdraw(interaction);
            case 'status': return handleStatus(interaction);
        }
    },
};

async function handleRegister(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    const tournamentId = interaction.options.getString('tournament_id');

    // Get tournament
    const { data: tournament, error: tErr } = await supabase
        .from('Tournament')
        .select('*')
        .eq('Tournament_UUID', tournamentId)
        .single();

    if (tErr || !tournament) {
        return interaction.editReply({
            embeds: [errorEmbed('Not Found', `Tournament \`${tournamentId}\` not found.`)],
        });
    }

    // Check registration deadline
    if (tournament.Registration_Deadline) {
        const deadline = new Date(tournament.Registration_Deadline);
        if (new Date() > deadline) {
            return interaction.editReply({
                embeds: [errorEmbed('Registration Closed', `Registration deadline was ${deadline.toLocaleDateString()}.`)],
            });
        }
    }

    // Check max teams
    if (tournament.Team_Participate >= tournament.Max_Teams) {
        return interaction.editReply({
            embeds: [errorEmbed('Full', 'This tournament has reached maximum team capacity.')],
        });
    }

    // Find user's franchise and game-specific roster
    const { data: franchise } = await supabase
        .from('Franchise')
        .select('Franchise_UUID, Franchise_Name')
        .eq('Owner_ID', user.UUID)
        .single();

    if (!franchise) {
        return interaction.editReply({
            embeds: [errorEmbed('No Team', 'You need to own a team to register. Create one with `/team create`.')],
        });
    }

    // Determine game from tournament
    const gameKey = getGameKeys().find(key => {
        const g = getGame(key);
        return tournament.Game?.toLowerCase().includes(key) || tournament.Game?.toLowerCase().includes(g.name.toLowerCase());
    });

    const game = gameKey ? getGame(gameKey) : null;

    if (!game || !game.tournamentParticipationTable) {
        return interaction.editReply({
            embeds: [errorEmbed('Unsupported', `Could not determine game type or this game doesn't support tournament participation.`)],
        });
    }

    // Get roster for this game
    const { data: roster } = await supabase
        .from(game.rosterTable)
        .select('Roster_UUID, Member_Size')
        .eq('Franchise_UUID', franchise.Franchise_UUID)
        .single();

    if (!roster) {
        return interaction.editReply({
            embeds: [errorEmbed('No Roster', `Your team doesn't have a **${game.name}** roster. Create one with \`/team create\`.`)],
        });
    }

    // Check if already registered
    const { data: existingReg } = await supabase
        .from(game.tournamentParticipationTable)
        .select('*')
        .eq('Tournament_UUID', tournamentId)
        .eq('Franchise_UUID', franchise.Franchise_UUID)
        .single();

    if (existingReg) {
        return interaction.editReply({
            embeds: [errorEmbed('Already Registered', `**${franchise.Franchise_Name}** is already registered for this tournament.`)],
        });
    }

    try {
        // Insert tournament participation
        const { error: partErr } = await supabase
            .from(game.tournamentParticipationTable)
            .insert({
                Tournament_UUID: tournamentId,
                Roster_UUID: roster.Roster_UUID,
                Franchise_UUID: franchise.Franchise_UUID,
                Participation_Status: 'registered',
                Created_At: new Date().toISOString(),
            });

        if (partErr) throw partErr;

        // Record in User_Tournament_Participation for all roster members
        const { data: rosterMembers } = await supabase
            .from(game.memberTable)
            .select('User_UUID')
            .eq('Roster_UUID', roster.Roster_UUID);

        if (rosterMembers) {
            const participationRows = rosterMembers.map(m => ({
                Tournament_UUID: tournamentId,
                User_UUID: m.User_UUID,
                Roster_UUID: roster.Roster_UUID,
                Franchise_UUID: franchise.Franchise_UUID,
                Created_At: new Date().toISOString(),
            }));

            await supabase.from('User_Tournament_Participation').insert(participationRows);
        }

        // Update tournament participate count
        await supabase
            .from('Tournament')
            .update({ Team_Participate: (tournament.Team_Participate || 0) + 1 })
            .eq('Tournament_UUID', tournamentId);

        // Send notification
        const notiUUID = generateUUID('noti-');
        await supabase.from('Notification').insert({
            Receiver_UUID: user.UUID,
            Notification_Type: 'tournament_registration',
            Status: 'unread',
            Notification_UUID: notiUUID,
            Data: JSON.stringify({
                tournament: tournament.Tournament_Name,
                franchise: franchise.Franchise_Name,
            }),
            Created_At: new Date().toISOString(),
            Is_System_Notification: true,
        });

        return interaction.editReply({
            embeds: [successEmbed('Registered! 🏆', `**${franchise.Franchise_Name}** has been registered for **${tournament.Tournament_Name}**!\n\n**Game:** ${game.emoji} ${game.name}\n**Roster Size:** ${roster.Member_Size} members\n\nYou'll be notified when the tournament starts. Good luck!`)],
        });

    } catch (err) {
        logger.error('Registration error:', err);
        return interaction.editReply({
            embeds: [errorEmbed('Registration Failed', `Could not register: ${err.message}`)],
        });
    }
}

async function handleWithdraw(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    const tournamentId = interaction.options.getString('tournament_id');

    // Get franchise
    const { data: franchise } = await supabase
        .from('Franchise')
        .select('Franchise_UUID, Franchise_Name')
        .eq('Owner_ID', user.UUID)
        .single();

    if (!franchise) {
        return interaction.editReply({
            embeds: [errorEmbed('No Team', 'You need to be a team owner to withdraw.')],
        });
    }

    // Try to find and delete participation across all game tables
    let withdrawn = false;
    for (const gKey of getGameKeys()) {
        const game = getGame(gKey);
        if (!game.tournamentParticipationTable) continue;

        const { data: reg } = await supabase
            .from(game.tournamentParticipationTable)
            .select('*')
            .eq('Tournament_UUID', tournamentId)
            .eq('Franchise_UUID', franchise.Franchise_UUID)
            .single();

        if (reg) {
            await supabase
                .from(game.tournamentParticipationTable)
                .delete()
                .eq('Tournament_UUID', tournamentId)
                .eq('Franchise_UUID', franchise.Franchise_UUID);

            // Remove from User_Tournament_Participation
            await supabase
                .from('User_Tournament_Participation')
                .delete()
                .eq('Tournament_UUID', tournamentId)
                .eq('Franchise_UUID', franchise.Franchise_UUID);

            // Decrement participate count
            const { data: tournament } = await supabase
                .from('Tournament')
                .select('Team_Participate')
                .eq('Tournament_UUID', tournamentId)
                .single();

            if (tournament) {
                await supabase
                    .from('Tournament')
                    .update({ Team_Participate: Math.max(0, (tournament.Team_Participate || 1) - 1) })
                    .eq('Tournament_UUID', tournamentId);
            }

            withdrawn = true;
            break;
        }
    }

    if (!withdrawn) {
        return interaction.editReply({
            embeds: [errorEmbed('Not Registered', `Your team isn't registered for this tournament.`)],
        });
    }

    return interaction.editReply({
        embeds: [successEmbed('Withdrawn', `**${franchise.Franchise_Name}** has been withdrawn from the tournament.`)],
    });
}

async function handleStatus(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    const tournamentId = interaction.options.getString('tournament_id');

    // Check participation
    const { data: participation } = await supabase
        .from('User_Tournament_Participation')
        .select('*, Franchise_UUID')
        .eq('Tournament_UUID', tournamentId)
        .eq('User_UUID', user.UUID)
        .single();

    if (!participation) {
        return interaction.editReply({
            embeds: [infoEmbed('📋 Not Registered', 'You are not registered for this tournament.')],
        });
    }

    // Get tournament name
    const { data: tournament } = await supabase
        .from('Tournament')
        .select('Tournament_Name, Status')
        .eq('Tournament_UUID', tournamentId)
        .single();

    // Get franchise name
    let franchiseName = 'Unknown';
    if (participation.Franchise_UUID) {
        const { data: franchise } = await supabase
            .from('Franchise')
            .select('Franchise_Name')
            .eq('Franchise_UUID', participation.Franchise_UUID)
            .single();
        if (franchise) franchiseName = franchise.Franchise_Name;
    }

    return interaction.editReply({
        embeds: [successEmbed('✅ Registered', `**Tournament:** ${tournament?.Tournament_Name || tournamentId}\n**Team:** ${franchiseName}\n**Tournament Status:** ${tournament?.Status || 'N/A'}\n**Registered:** ${new Date(participation.Created_At).toLocaleDateString()}`)],
    });
}

/**
 * Handle tournament register button click
 */
async function handleTournamentRegisterButton(interaction) {
    const tournamentUUID = interaction.customId.replace('tournament_register_', '');

    // Redirect to the register command flow
    const user = await ensureRegistered(interaction);
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    // Re-use the register logic with a synthetic tournament_id
    const { data: franchise } = await supabase
        .from('Franchise')
        .select('Franchise_UUID, Franchise_Name')
        .eq('Owner_ID', user.UUID)
        .single();

    if (!franchise) {
        return interaction.editReply({
            embeds: [errorEmbed('No Team', 'You need to own a team to register. Use `/team create` first, then `/register tournament`.')],
        });
    }

    return interaction.editReply({
        embeds: [infoEmbed('📝 Register', `Use the command:\n\`/register tournament ${tournamentUUID}\`\n\nThis will register **${franchise.Franchise_Name}** for the tournament.`)],
    });
}

module.exports.handleTournamentRegisterButton = handleTournamentRegisterButton;
