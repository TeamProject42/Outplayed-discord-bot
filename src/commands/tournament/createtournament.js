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
        .addIntegerOption(opt => opt.setName('team_size').setDescription('Players per team (2-5)').setRequired(true).setMinValue(2).setMaxValue(5))
        .addIntegerOption(opt => opt.setName('max_teams').setDescription('Maximum teams allowed').setRequired(true).setMinValue(2).setMaxValue(64))
        .addStringOption(opt => opt.setName('format').setDescription('Tournament format').setRequired(true)
            .addChoices(
                { name: 'Knockout (Single Elimination)', value: 'knockout' },
                { name: 'League (Round Robin)', value: 'league' },
                { name: 'Swiss', value: 'swiss' },
            ))
        .addStringOption(opt => opt.setName('start_time').setDescription('Start date/time (e.g. 2025-03-15 18:00)').setRequired(true))
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
        const data = {
            tournamentCode,
            guildId: interaction.guild.id,
            ownerId: interaction.user.id,
            name: interaction.options.getString('name'),
            game: interaction.options.getString('game'),
            teamSize: interaction.options.getInteger('team_size'),
            maxTeams: interaction.options.getInteger('max_teams'),
            format: interaction.options.getString('format'),
            startTime: interaction.options.getString('start_time'),
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

    // Check rank restriction
    if (tournament.rank_restriction) {
        // Simple check — player's rank must match or exceed the restriction
        // For MVP, just check if the player's game matches
        if (player.game !== tournament.game) {
            return interaction.reply({
                embeds: [errorEmbed('Wrong Game', `This tournament is for **${tournament.game}**. Your profile is set to **${player.game}**.`)],
                ephemeral: true,
            });
        }
    }

    // Find the player's teams that match the tournament team size
    const playerTeams = teams.getByPlayer(interaction.user.id);
    const eligibleTeams = playerTeams.filter(t =>
        t.size === tournament.team_size && t.locked && !tournaments.isTeamRegistered(tournamentId, t.id)
    );

    if (eligibleTeams.length === 0) {
        return interaction.reply({
            embeds: [errorEmbed(
                'No Eligible Team',
                `You need a **locked team of ${tournament.team_size}** players to register.\n\nUse \`/createteam\` to make one, then fill it up!`
            )],
            ephemeral: true,
        });
    }

    // Check max teams
    const regCount = tournaments.getRegistrationCount(tournamentId);
    if (regCount >= tournament.max_teams) {
        return interaction.reply({ embeds: [errorEmbed('Tournament Full', 'This tournament has reached maximum capacity.')], ephemeral: true });
    }

    // If only one eligible team, auto-register it
    if (eligibleTeams.length === 1) {
        const team = eligibleTeams[0];

        // Check if captain
        if (team.captain_id !== interaction.user.id) {
            return interaction.reply({
                embeds: [errorEmbed('Captain Only', 'Only the team captain can register the team for a tournament.')],
                ephemeral: true,
            });
        }

        tournaments.registerTeam(tournamentId, team.id);
        teams.setTournament(team.id, tournamentId);

        const newCount = tournaments.getRegistrationCount(tournamentId);

        return interaction.reply({
            embeds: [successEmbed('Registered!', `**${team.name}** is registered for **${tournament.name}**!\n\n📊 Teams registered: ${newCount}/${tournament.max_teams}`)],
            ephemeral: true,
        });
    }

    // Multiple eligible teams — for now just register the first one
    const team = eligibleTeams[0];
    if (team.captain_id !== interaction.user.id) {
        return interaction.reply({
            embeds: [errorEmbed('Captain Only', 'Only the team captain can register the team.')],
            ephemeral: true,
        });
    }

    tournaments.registerTeam(tournamentId, team.id);
    teams.setTournament(team.id, tournamentId);
    const newCount = tournaments.getRegistrationCount(tournamentId);

    await interaction.reply({
        embeds: [successEmbed('Registered!', `**${team.name}** is registered for **${tournament.name}**!\n\n📊 Teams registered: ${newCount}/${tournament.max_teams}`)],
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
