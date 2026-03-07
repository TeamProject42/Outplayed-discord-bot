const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { successEmbed, errorEmbed, infoEmbed, tournamentEmbed } = require('../../utils/embeds');
const { getGameChoices, getGame, getGameKeys } = require('../../utils/gameConstants');
const { paginate, formatDate, generateUUID } = require('../../utils/helpers');
const { handleCommandError } = require('../../utils/errorHandler');
const { ERRORS, TITLES } = require('../../utils/constants');
const config = require('../../config');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tournaments')
        .setDescription('Browse and view tournaments')
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List available tournaments')
                .addStringOption(opt =>
                    opt.setName('game')
                        .setDescription('Filter by game')
                        .setRequired(false)
                        .addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View tournament details')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Tournament UUID')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('register')
                .setDescription('Register your team for a tournament')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Tournament UUID')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('withdraw')
                .setDescription('Withdraw from a tournament')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Tournament UUID')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Check your registration status')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Tournament UUID')
                        .setRequired(true))),

    async execute(interaction) {
        try {
            const sub = interaction.options.getSubcommand();

            if (sub === 'list') return await handleList(interaction);
            if (sub === 'view') return await handleView(interaction);
            if (sub === 'register') return await handleRegister(interaction);
            if (sub === 'withdraw') return await handleWithdraw(interaction);
            if (sub === 'status') return await handleStatus(interaction);
        } catch (error) {
            await handleCommandError(interaction, error);
        }
    },
};

async function handleList(interaction) {
    try {
        await interaction.deferReply();

        const gameFilter = interaction.options.getString('game');

        let query = supabase
            .from('Tournament')
            .select('Tournament_UUID, Tournament_Name, Game, Starting_Date, Ending_Date, Status, Prize_Pool, Max_Teams, Team_Participate, Registration_Fee, Registration_Deadline, Format')
            .order('Starting_Date', { ascending: true });

        if (gameFilter) {
            // Filter by game name (case-insensitive partial match)
            const { getGame } = require('../../utils/gameConstants');
            const game = getGame(gameFilter);
            if (game) {
                query = query.ilike('Game', `%${game.name}%`);
            }
        }

        const { data: tournaments, error } = await query;

        if (error) {
            throw error;
        }

        if (!tournaments || tournaments.length === 0) {
            return interaction.editReply({
                embeds: [infoEmbed(`🏆 No ${TITLES.TOURNAMENT}s`, gameFilter
                    ? 'No tournaments found for this game. Check back later!'
                    : 'No tournaments available right now. Check back later!')],
            });
        }

        // Paginate results
        const pages = paginate(tournaments, 5);
        const page = pages[0];

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`🏆 ${TITLES.TOURNAMENT}s`)
            .setDescription(page.map((t, i) => {
                const spots = `${t.Team_Participate || 0}/${t.Max_Teams}`;
                const fee = t.Registration_Fee ? `₹${t.Registration_Fee}` : 'Free';
                const prize = t.Prize_Pool ? `₹${t.Prize_Pool.toLocaleString()}` : 'N/A';
                return `**${i + 1}. ${t.Tournament_Name}**\n🎮 ${t.Game} | 📋 ${t.Format} | 💰 ${prize}\n👥 ${spots} teams | 💵 ${fee} | 📊 ${t.Status || 'upcoming'}\n📅 ${formatDate(t.Starting_Date)} — ${formatDate(t.Ending_Date)}\n🔑 \`${t.Tournament_UUID}\``;
            }).join('\n\n'))
            .setFooter({ text: `${config.botName} • Page 1/${pages.length} • Use /tournaments view <id> for details` })
            .setTimestamp();

        const components = [];
        if (pages.length > 1) {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('page_tournaments_prev_0').setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('page_tournaments_next_0').setLabel('Next ▶').setStyle(ButtonStyle.Primary),
            ));
        }

        return interaction.editReply({ embeds: [embed], components });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleView(interaction) {
    try {
        await interaction.deferReply();

        const tournamentId = interaction.options.getString('id');

        const { data: tournament, error } = await supabase
            .from('Tournament')
            .select('*')
            .eq('Tournament_UUID', tournamentId)
            .single();

        if (error || !tournament) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.NOT_FOUND, `Tournament \`${tournamentId}\` not found. Use \`/tournaments list\` to browse.`)],
            });
        }

        const embed = tournamentEmbed(tournament);

        // Add rules if present
        if (tournament.Rules) {
            try {
                const rules = typeof tournament.Rules === 'string' ? JSON.parse(tournament.Rules) : tournament.Rules;
                if (Array.isArray(rules)) {
                    embed.addFields({ name: '📜 Rules', value: rules.map((r, i) => `${i + 1}. ${r}`).join('\n') });
                } else if (typeof rules === 'object') {
                    const ruleText = Object.entries(rules).map(([k, v]) => `**${k}:** ${v}`).join('\n');
                    embed.addFields({ name: '📜 Rules', value: ruleText || 'No rules specified.' });
                }
            } catch (e) {
                embed.addFields({ name: '📜 Rules', value: String(tournament.Rules) });
            }
        }

        // Add prize distribution if present
        if (tournament.Prize_Pool_Distribution) {
            try {
                const dist = typeof tournament.Prize_Pool_Distribution === 'string'
                    ? JSON.parse(tournament.Prize_Pool_Distribution)
                    : tournament.Prize_Pool_Distribution;
                const distText = Object.entries(dist).map(([k, v]) => `🥇 **${k}:** ₹${v.toLocaleString?.() || v}`).join('\n');
                embed.addFields({ name: '💰 Prize Distribution', value: distText || 'N/A' });
            } catch (e) {
                // skip
            }
        }

        // Add register button
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`tournament_register_${tournament.Tournament_UUID}`)
                .setLabel('Register')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝'),
        );

        return interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleRegister(interaction) {
    try {
        if (interaction.guild && interaction.guild.ownerId === interaction.user.id) {
            return interaction.reply({
                embeds: [errorEmbed(TITLES.ACCESS_DENIED, ERRORS.ACCESS_DENIED_OWNER)],
                flags: [MessageFlags.Ephemeral]
            });
        }

        const user = await ensureRegistered(interaction);
        if (!user) return;

        const tournamentId = interaction.options.getString('id') || interaction.customId?.replace('tournament_register_', '');

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: 'Processing registration...', embeds: [], components: [] });
        } else {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        }

        // Get tournament
        const { data: tournament, error: tErr } = await supabase
            .from('Tournament')
            .select('*')
            .eq('Tournament_UUID', tournamentId)
            .single();

        if (tErr || !tournament) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.NOT_FOUND, `Tournament \`${tournamentId}\` not found.`)],
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

        // Find user's franchise
        const { data: franchise } = await supabase
            .from('Franchise')
            .select('Franchise_UUID, Franchise_Name')
            .eq('Owner_ID', user.UUID)
            .single();

        if (!franchise) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, ERRORS.TEAM_REQUIRED)],
            });
        }

        // Determine game
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

        // Get roster
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

        // Check already registered
        const { data: existingReg } = await supabase
            .from(game.tournamentParticipationTable)
            .select('*')
            .eq('Tournament_UUID', tournamentId)
            .eq('Franchise_UUID', franchise.Franchise_UUID)
            .single();

        if (existingReg) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `**${franchise.Franchise_Name}** is already registered for this tournament.`)],
            });
        }

        // Insert participation
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

        // Record for members
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

        // Update count
        await supabase
            .from('Tournament')
            .update({ Team_Participate: (tournament.Team_Participate || 0) + 1 })
            .eq('Tournament_UUID', tournamentId);

        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `**${franchise.Franchise_Name}** registered for **${tournament.Tournament_Name}**!`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleWithdraw(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const tournamentId = interaction.options.getString('id');

        const { data: franchise } = await supabase
            .from('Franchise')
            .select('Franchise_UUID, Franchise_Name')
            .eq('Owner_ID', user.UUID)
            .single();

        if (!franchise) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, 'You need to be a team owner to withdraw.')],
            });
        }

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
                await supabase.from(game.tournamentParticipationTable).delete().eq('Tournament_UUID', tournamentId).eq('Franchise_UUID', franchise.Franchise_UUID);
                await supabase.from('User_Tournament_Participation').delete().eq('Tournament_UUID', tournamentId).eq('Franchise_UUID', franchise.Franchise_UUID);
                
                const { data: tournament } = await supabase.from('Tournament').select('Team_Participate').eq('Tournament_UUID', tournamentId).single();
                if (tournament) {
                    await supabase.from('Tournament').update({ Team_Participate: Math.max(0, (tournament.Team_Participate || 1) - 1) }).eq('Tournament_UUID', tournamentId);
                }
                withdrawn = true;
                break;
            }
        }

        if (!withdrawn) {
            return interaction.editReply({ embeds: [errorEmbed('Not Registered', `Your team isn't registered.`)] });
        }

        return interaction.editReply({ embeds: [successEmbed(TITLES.SUCCESS, `Withdrawn from tournament.`)] });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleStatus(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const tournamentId = interaction.options.getString('id');

        const { data: participation } = await supabase
            .from('User_Tournament_Participation')
            .select('*, Franchise_UUID')
            .eq('Tournament_UUID', tournamentId)
            .eq('User_UUID', user.UUID)
            .single();

        if (!participation) {
            return interaction.editReply({ embeds: [infoEmbed('📋 Not Registered', 'You are not registered.')] });
        }

        const { data: tournament } = await supabase.from('Tournament').select('Tournament_Name, Status').eq('Tournament_UUID', tournamentId).single();
        
        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `**Tournament:** ${tournament?.Tournament_Name || tournamentId}\n**Status:** ${tournament?.Status || 'N/A'}`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleTournamentRegisterButton(interaction) {
    // Direct register with button
    return await handleRegister(interaction);
}

module.exports.handleTournamentRegisterButton = handleTournamentRegisterButton;
