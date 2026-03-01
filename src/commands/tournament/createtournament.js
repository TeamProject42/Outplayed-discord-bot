const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments, players, teams } = require('../../database/db');
const { generateTournamentId } = require('../../utils/codeGenerator');
const { successEmbed, errorEmbed, tournamentEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const buttonHandler = require('../../interactions/buttons');

/**
 * Parses separate date and time strings into a Date object.
 * Date: "15/03/2025", "15-03-2025", "2025-03-15"
 * Time: "4pm", "6:30pm", "18:00", "9am"
 */
function parseDateAndTime(dateStr, timeStr) {
    let day, month, year;

    // Try dd/mm/yyyy or dd-mm-yyyy
    const ddmm = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmm) {
        day = parseInt(ddmm[1]);
        month = parseInt(ddmm[2]) - 1; // 0-indexed
        year = parseInt(ddmm[3]);
    } else {
        // Try yyyy-mm-dd
        const iso = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (iso) {
            year = parseInt(iso[1]);
            month = parseInt(iso[2]) - 1;
            day = parseInt(iso[3]);
        } else {
            return null;
        }
    }

    // Parse time
    const time = parseTimeString(timeStr);
    if (!time) return null;

    return new Date(year, month, day, time.hours, time.minutes);
}

/**
 * Parses time strings like "6pm", "1:30pm", "18:00", "6:30 AM"
 */
function parseTimeString(str) {
    str = str.trim().toLowerCase();

    // Match "6pm", "1:30pm", "6:30 am", "12am"
    const ampmMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1]);
        const minutes = parseInt(ampmMatch[2] || '0');
        const period = ampmMatch[3];
        if (period === 'pm' && hours !== 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;
        return { hours, minutes };
    }

    // Match 24h "18:00", "9:30"
    const h24Match = str.match(/^(\d{1,2}):(\d{2})$/);
    if (h24Match) {
        return { hours: parseInt(h24Match[1]), minutes: parseInt(h24Match[2]) };
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createtournament')
        .setDescription('🏆 Create a new tournament (Server Owner only)')
        .addStringOption(opt => opt.setName('name').setDescription('Tournament name').setRequired(true))
        .addStringOption(opt => opt.setName('game').setDescription('Game (valorant, cs2, fortnite, apex, league)').setRequired(true)
            .addChoices(
                { name: 'Valorant', value: 'Valorant' },
                { name: 'CS2', value: 'CS2' },
                { name: 'Fortnite', value: 'Fortnite' },
                { name: 'Apex Legends', value: 'Apex Legends' },
                { name: 'League of Legends', value: 'League of Legends' },
            ))
        .addIntegerOption(opt => opt.setName('team_size').setDescription('Players per team (1-10)').setRequired(true).setMinValue(1).setMaxValue(10))
        .addIntegerOption(opt => opt.setName('max_teams').setDescription('Maximum teams allowed').setRequired(true).setMinValue(2).setMaxValue(1024))
        .addStringOption(opt => opt.setName('format').setDescription('Tournament format').setRequired(true)
            .addChoices(
                { name: 'Knockout (Single Elimination)', value: 'knockout' },
                { name: 'League (Round Robin)', value: 'league' },
                { name: 'Swiss', value: 'swiss' },
            ))
        .addStringOption(opt => opt.setName('date').setDescription('Start date (e.g. 15/03/2025)').setRequired(true))
        .addStringOption(opt => opt.setName('time').setDescription('Start time (e.g. 4pm, 6:30pm, 18:00)').setRequired(true))
        .addIntegerOption(opt => opt.setName('checkin_window').setDescription('Check-in window in minutes (default: 15)').setRequired(false))
        .addStringOption(opt => opt.setName('rank_restriction').setDescription('Min rank required (optional)').setRequired(false))
        .addStringOption(opt => opt.setName('entry_fee').setDescription('Entry fee (optional, e.g. "$5")').setRequired(false))
        .addStringOption(opt => opt.setName('prize_pool').setDescription('Prize pool (optional, e.g. "$100")').setRequired(false)),

    async execute(interaction) {
        // Owner check
        const isOwner = await ownerOnly(interaction);
        if (!isOwner) return;

        await interaction.deferReply();

        const tournamentCode = generateTournamentId();

        // Parse and validate date
        const rawDate = interaction.options.getString('date').trim();
        const rawTime = interaction.options.getString('time').trim();

        const parsedDate = parseDateAndTime(rawDate, rawTime);

        if (!parsedDate || isNaN(parsedDate.getTime())) {
            return interaction.editReply({
                embeds: [errorEmbed('Invalid Date/Time', `Could not parse date \`${rawDate}\` and time \`${rawTime}\`.\n\n**Date formats:** \`15/03/2025\`, \`15-03-2025\`\n**Time formats:** \`4pm\`, \`6:30pm\`, \`18:00\``)],
            });
        }

        const data = {
            tournamentCode,
            guildId: interaction.guild.id,
            ownerId: interaction.user.id,
            name: interaction.options.getString('name'),
            game: interaction.options.getString('game'),
            teamSize: interaction.options.getInteger('team_size'),
            maxTeams: interaction.options.getInteger('max_teams'),
            format: interaction.options.getString('format'),
            startTime: parsedDate.toISOString(),
            checkinWindow: interaction.options.getInteger('checkin_window') || 15,
            rankRestriction: interaction.options.getString('rank_restriction') || null,
            entryFee: interaction.options.getString('entry_fee') || null,
            prizePool: interaction.options.getString('prize_pool') || null,
        };

        // Create tournament
        const result = tournaments.create(data);
        const tournament = tournaments.getById(result.lastInsertRowid);

        logOwnerAction(interaction.guild.id, interaction.user.id, 'CREATE_TOURNAMENT', tournamentCode, data);

        // Build registration embed
        const embed = tournamentEmbed(tournament);

        // Registration buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`tourney_register_team_${tournament.id}`)
                .setLabel('Register as Team')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🛡️'),
            new ButtonBuilder()
                .setCustomId(`tourney_register_solo_${tournament.id}`)
                .setLabel('Join Solo')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👤'),
        );

        // Post to channel (public)
        await interaction.editReply({
            content: '## 🚨 New Tournament Live — Register Now!\n@everyone',
            embeds: [embed],
            components: [row],
        });

        // Invite link info
        const inviteUrl = `http://localhost:3000/tournament/${tournamentCode}`;
        await interaction.followUp({
            content: `📎 **Share this tournament:**\n🔗 ${inviteUrl}\n\n📋 **Tournament ID:** \`${tournamentCode}\``,
            ephemeral: true,
        });

        logger.info(`Tournament created: ${data.name} (${tournamentCode}) by ${interaction.user.tag}`);
    },
};

// ─── Register as Team ────────────────────────────────────────
buttonHandler.register('tourney_register_team_', async (interaction) => {
    const tournamentId = parseInt(interaction.customId.split('_')[3]);
    const tournament = tournaments.getById(tournamentId);

    if (!tournament || tournament.status !== 'registration') {
        return interaction.reply({ embeds: [errorEmbed('Registration Closed', 'This tournament is no longer accepting registrations.')], ephemeral: true });
    }

    // Must have a profile
    const player = players.get(interaction.user.id);
    if (!player) {
        return interaction.reply({ embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')], ephemeral: true });
    }

    // Only captain can register
    const playerTeams = teams.getByPlayer(interaction.user.id);
    const captainTeams = playerTeams.filter(t => t.captain_id === interaction.user.id);

    if (captainTeams.length === 0) {
        return interaction.reply({
            embeds: [errorEmbed('Captain Only', 'Only team captains can register. Create a team with `/createteam` first.')],
            ephemeral: true,
        });
    }

    // Check if player is already in a team registered for THIS tournament
    const registeredTeams = tournaments.getRegisteredTeams(tournamentId);
    const alreadyRegistered = registeredTeams.find(rt => {
        const members = teams.getMembers(rt.id);
        return members.some(m => m.discord_id === interaction.user.id);
    });

    if (alreadyRegistered) {
        return interaction.reply({
            embeds: [errorEmbed('Already Registered', `You're already in **${alreadyRegistered.name}** which is registered for this tournament.\n\nLeave that team first with \`/leaveteam\` to register with a different team.`)],
            ephemeral: true,
        });
    }

    // Check rank restriction
    if (tournament.rank_restriction) {
        if (player.game !== tournament.game) {
            return interaction.reply({
                embeds: [errorEmbed('Wrong Game', `This tournament is for **${tournament.game}**. Your profile is set to **${player.game}**.`)],
                ephemeral: true,
            });
        }
    }

    // Find eligible teams (right size, locked, not already registered)
    const eligibleTeams = captainTeams.filter(t =>
        t.size === tournament.team_size && t.locked && !tournaments.isTeamRegistered(tournamentId, t.id)
    );

    if (eligibleTeams.length === 0) {
        return interaction.reply({
            embeds: [errorEmbed(
                'No Eligible Team',
                `You need a **locked team of ${tournament.team_size}** players where you are the captain.\n\nUse \`/createteam\` to make one, then fill it up!`
            )],
            ephemeral: true,
        });
    }

    // Check max teams
    const regCount = tournaments.getRegistrationCount(tournamentId);
    if (regCount >= tournament.max_teams) {
        return interaction.reply({ embeds: [errorEmbed('Registration Full', 'This tournament has reached maximum capacity. Registration is closed.')], ephemeral: true });
    }

    // Register the first eligible team
    const team = eligibleTeams[0];
    tournaments.registerTeam(tournamentId, team.id);
    teams.setTournament(team.id, tournamentId);

    const newCount = tournaments.getRegistrationCount(tournamentId);

    // Auto-close registration if full
    if (newCount >= tournament.max_teams) {
        tournaments.updateStatus(tournamentId, 'registration_closed');
        // Update the original message to show registration closed
        try {
            await interaction.message.edit({
                components: [], // Remove buttons
            });
            await interaction.channel.send({
                content: `## 🔒 Registration Closed!\n**${tournament.name}** has reached **${tournament.max_teams}/${tournament.max_teams}** teams. Registration is now closed!`,
            });
        } catch (_) { }
    }

    return interaction.reply({
        embeds: [successEmbed('Registered!', `**${team.name}** is registered for **${tournament.name}**!\n\n📊 Teams registered: ${newCount}/${tournament.max_teams}${newCount >= tournament.max_teams ? '\n🔒 **Registration is now CLOSED!**' : ''}`)],
        ephemeral: true,
    });
});

// ─── Join Solo (queue for auto team) ─────────────────────────
buttonHandler.register('tourney_register_solo_', async (interaction) => {
    const tournamentId = parseInt(interaction.customId.split('_')[3]);
    const tournament = tournaments.getById(tournamentId);

    if (!tournament || tournament.status !== 'registration') {
        return interaction.reply({ embeds: [errorEmbed('Registration Closed', 'This tournament is no longer accepting registrations.')], ephemeral: true });
    }

    const player = players.get(interaction.user.id);
    if (!player) {
        return interaction.reply({ embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')], ephemeral: true });
    }

    if (player.game !== tournament.game) {
        return interaction.reply({
            embeds: [errorEmbed('Wrong Game', `This tournament is for **${tournament.game}**. Your profile is set to **${player.game}**.`)],
            ephemeral: true,
        });
    }

    await interaction.reply({
        embeds: [successEmbed('Solo Queue', `You've been added to the solo queue for **${tournament.name}**!\n\nUse \`/findteam\` to get auto-matched, or use \`/createteam\` and share your code.`)],
        ephemeral: true,
    });
});
