const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments, matches: matchDb, teams: teamDb, players } = require('../../database/db');
const { advanceWinner } = require('../../utils/bracketEngine');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const selectHandler = require('../../interactions/selectMenus');
const modalHandler = require('../../interactions/modals');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resolvedispute')
        .setDescription('⚖️ Resolve a disputed match (Server Owner only)')
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

        // Get all non-completed matches with both teams set
        const allMatches = matchDb.getByTournament(tournament.id).filter(m => m.team1_id && m.team2_id);

        if (allMatches.length === 0) {
            return interaction.reply({ embeds: [errorEmbed('No Matches', 'No matches available to dispute.')], ephemeral: true });
        }

        const options = allMatches.map(m => {
            const t1 = teamDb.getById(m.team1_id);
            const t2 = teamDb.getById(m.team2_id);
            const statusEmoji = m.winner_id ? '✅' : '⏳';
            return {
                label: `${statusEmoji} R${m.round} M${m.match_number}: ${t1?.name || '?'} vs ${t2?.name || '?'}`,
                value: `${m.id}`,
                emoji: '⚖️',
            };
        }).slice(0, 25);

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`resolvedispute_match_${tournament.id}_${interaction.user.id}`)
            .setPlaceholder('Select the disputed match...')
            .addOptions(options);

        await interaction.reply({
            content: '## ⚖️ Resolve Dispute\nSelect the match in question:',
            components: [new ActionRowBuilder().addComponents(menu)],
            ephemeral: true,
        });
    },
};

// ─── Match selected → choose winner + reasoning ─────────────
selectHandler.register('resolvedispute_match_', async (interaction) => {
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
        .setCustomId(`resolvedispute_winner_${tournamentId}_${matchId}_${interaction.user.id}`)
        .setPlaceholder('Select the rightful winner...')
        .addOptions([
            { label: t1.name, value: `${t1.id}`, emoji: '🔴' },
            { label: t2.name, value: `${t2.id}`, emoji: '🔵' },
        ]);

    await interaction.update({
        content: `## ⚖️ Dispute Resolution\n**${t1.name}** vs **${t2.name}**\n\nSelect the team that should win:`,
        components: [new ActionRowBuilder().addComponents(winnerMenu)],
    });
});

// ─── Winner selected → ask for reasoning ────────────────────
selectHandler.register('resolvedispute_winner_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const tournamentId = parseInt(parts[2]);
    const matchId = parseInt(parts[3]);
    const originalUserId = parts[4];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ Not your session.', ephemeral: true });
    }

    const winnerId = interaction.values[0];

    const modal = new ModalBuilder()
        .setCustomId(`resolvedispute_reason_${tournamentId}_${matchId}_${winnerId}_${interaction.user.id}`)
        .setTitle('Dispute Reasoning');

    const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Explain your decision')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('e.g. Reviewed screenshots, Team A completed the objective first...');

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
});

// ─── Final decision logged ──────────────────────────────────
modalHandler.register('resolvedispute_reason_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const tournamentId = parseInt(parts[2]);
    const matchId = parseInt(parts[3]);
    const winnerId = parseInt(parts[4]);
    const originalUserId = parts[5];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ Not your session.', ephemeral: true });
    }

    const reason = interaction.fields.getTextInputValue('reason');

    const match = matchDb.getById(matchId);
    const winnerTeam = teamDb.getById(winnerId);
    const loserTeamId = match.team1_id === winnerId ? match.team2_id : match.team1_id;
    const loserTeam = teamDb.getById(loserTeamId);

    // If match already had a different winner, reverse the stats
    if (match.winner_id && match.winner_id !== winnerId) {
        const prevWinnerMembers = teamDb.getMembers(match.winner_id);
        const prevLoserTeamId = match.team1_id === match.winner_id ? match.team2_id : match.team1_id;
        const prevLoserMembers = teamDb.getMembers(prevLoserTeamId);

        // Reverse previous result
        for (const m of prevWinnerMembers) {
            players.update(m.discord_id, { wins: Math.max(0, m.wins - 1) });
        }
        for (const m of prevLoserMembers) {
            players.update(m.discord_id, { losses: Math.max(0, m.losses - 1) });
        }
    }

    // Apply new result
    const winnerMembers = teamDb.getMembers(winnerId);
    const loserMembers = teamDb.getMembers(loserTeamId);

    if (!match.winner_id || match.winner_id !== winnerId) {
        for (const m of winnerMembers) players.addWin(m.discord_id);
        for (const m of loserMembers) players.addLoss(m.discord_id);
    }

    // Update match
    advanceWinner(tournamentId, matchId, winnerId);

    logOwnerAction(interaction.guild.id, interaction.user.id, 'RESOLVE_DISPUTE', `Match ${matchId}`, {
        matchId,
        winner: winnerTeam.name,
        loser: loserTeam?.name,
        previousWinner: match.winner_id ? teamDb.getById(match.winner_id)?.name : null,
        reason,
    });

    // Announce in match channel
    if (match.channel_id) {
        try {
            const channel = await interaction.guild.channels.fetch(match.channel_id);
            if (channel) {
                await channel.send({
                    content: `## ⚖️ Dispute Resolved by Server Owner\n**Winner:** ${winnerTeam.name}\n**Reason:** ${reason}`,
                });
            }
        } catch (_) { }
    }

    logger.info(`Dispute resolved: Match ${matchId} → ${winnerTeam.name} (reason: ${reason})`);

    await interaction.reply({
        embeds: [successEmbed('Dispute Resolved', `**Match decided by owner ruling.**\n\n🏆 **Winner:** ${winnerTeam.name}\n❌ **Loser:** ${loserTeam?.name || 'N/A'}\n📝 **Reason:** ${reason}\n\n*Decision logged and bracket updated.*`)],
        ephemeral: true,
    });
});
