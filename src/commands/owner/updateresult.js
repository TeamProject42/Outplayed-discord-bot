const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments, matches: matchDb, teams: teamDb, players } = require('../../database/db');
const { advanceWinner } = require('../../utils/bracketEngine');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const selectHandler = require('../../interactions/selectMenus');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('updateresult')
        .setDescription('📊 Set the result of a match (Server Owner only)')
        .addStringOption(opt =>
            opt.setName('tournament_id').setDescription('Tournament code').setRequired(true)
        ),

    async execute(interaction) {
        const isOwner = await ownerOnly(interaction);
        if (!isOwner) return;

        const code = interaction.options.getString('tournament_id').toUpperCase().trim();
        const tournament = tournaments.getByCode(code);

        if (!tournament) {
            return interaction.reply({ embeds: [errorEmbed('Not Found', `No tournament with code \`${code}\`.`)], ephemeral: true });
        }

        // Get pending/active matches
        const pendingMatches = matchDb.getPending(tournament.id)
            .concat(matchDb.getByTournament(tournament.id).filter(m => m.status === 'active'))
            .filter(m => m.team1_id && m.team2_id && !m.winner_id);

        if (pendingMatches.length === 0) {
            return interaction.reply({ embeds: [errorEmbed('No Active Matches', 'There are no matches waiting for results.')], ephemeral: true });
        }

        // Build match selector
        const options = pendingMatches.map(m => {
            const t1 = teamDb.getById(m.team1_id);
            const t2 = teamDb.getById(m.team2_id);
            return {
                label: `R${m.round} M${m.match_number}: ${t1?.name || '?'} vs ${t2?.name || '?'}`,
                value: `${m.id}`,
                emoji: '⚔️',
            };
        }).slice(0, 25);

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`updateresult_match_${tournament.id}_${interaction.user.id}`)
            .setPlaceholder('Select a match...')
            .addOptions(options);

        await interaction.reply({
            content: '## 📊 Update Match Result\nSelect the match:',
            components: [new ActionRowBuilder().addComponents(menu)],
            ephemeral: true,
        });
    },
};

// ─── Match selected → choose winner ─────────────────────────
selectHandler.register('updateresult_match_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const tournamentId = parseInt(parts[2]);
    const originalUserId = parts[3];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ Not your session.', ephemeral: true });
    }

    const matchId = parseInt(interaction.values[0]);
    const match = matchDb.getById(matchId);
    const t1 = teamDb.getById(match.team1_id);
    const t2 = teamDb.getById(match.team2_id);

    const winnerMenu = new StringSelectMenuBuilder()
        .setCustomId(`updateresult_winner_${tournamentId}_${matchId}_${interaction.user.id}`)
        .setPlaceholder('Select the winning team...')
        .addOptions([
            { label: t1.name, value: `${t1.id}`, emoji: '🔴' },
            { label: t2.name, value: `${t2.id}`, emoji: '🔵' },
        ]);

    await interaction.update({
        content: `## 🏆 Select Winner\n**${t1.name}** vs **${t2.name}**`,
        components: [new ActionRowBuilder().addComponents(winnerMenu)],
    });
});

// ─── Winner selected → update bracket ───────────────────────
selectHandler.register('updateresult_winner_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const tournamentId = parseInt(parts[2]);
    const matchId = parseInt(parts[3]);
    const originalUserId = parts[4];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ Not your session.', ephemeral: true });
    }

    const winnerId = parseInt(interaction.values[0]);
    const match = matchDb.getById(matchId);
    const winnerTeam = teamDb.getById(winnerId);
    const loserTeamId = match.team1_id === winnerId ? match.team2_id : match.team1_id;
    const loserTeam = teamDb.getById(loserTeamId);

    // Update W/L for all team members
    const winnerMembers = teamDb.getMembers(winnerId);
    const loserMembers = teamDb.getMembers(loserTeamId);

    for (const m of winnerMembers) players.addWin(m.discord_id);
    for (const m of loserMembers) players.addLoss(m.discord_id);

    // Advance in bracket
    const result = advanceWinner(tournamentId, matchId, winnerId);

    const tournament = tournaments.getById(tournamentId);
    logOwnerAction(interaction.guild.id, interaction.user.id, 'UPDATE_RESULT', `Match ${matchId}`, {
        winner: winnerTeam.name,
        loser: loserTeam?.name,
        matchId,
    });

    let responseText = `**${winnerTeam.name}** wins!\n\n`;

    if (result?.isFinal) {
        responseText += `## 🏆 ${winnerTeam.name} IS THE CHAMPION!\n\nCongratulations!`;
        tournaments.updateStatus(tournamentId, 'completed');
    } else if (result?.isReady) {
        responseText += `Next match (Round ${result.nextRound}, Match ${result.nextMatchNumber}) is now ready!`;
    } else if (result) {
        responseText += `${winnerTeam.name} advances to Round ${result.nextRound}.`;
    }

    // Announce in match channel
    if (match.channel_id) {
        try {
            const channel = await interaction.guild.channels.fetch(match.channel_id);
            if (channel) {
                await channel.send({
                    content: `## 🏆 Match Result\n**Winner:** ${winnerTeam.name}\n**Loser:** ${loserTeam?.name || 'N/A'}\n\nThis match is concluded.`,
                });
            }
        } catch (_) { }
    }

    logger.info(`Result updated: Match ${matchId} → Winner: ${winnerTeam.name}`);

    await interaction.update({
        content: null,
        embeds: [successEmbed('Result Updated', responseText)],
        components: [],
    });
});
