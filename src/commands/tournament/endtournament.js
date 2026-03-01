const { SlashCommandBuilder } = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments, matches: matchDb, teams: teamDb } = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { getBracketState } = require('../../utils/bracketEngine');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('endtournament')
        .setDescription('🏁 End a tournament and announce results (Server Owner only)')
        .addStringOption(opt =>
            opt.setName('tournament_id')
                .setDescription('Tournament code (e.g. OUT-XXXXX)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const isOwner = await ownerOnly(interaction);
        if (!isOwner) return;

        const code = interaction.options.getString('tournament_id').toUpperCase().trim();
        const tournament = tournaments.getByCode(code);

        if (!tournament) {
            return interaction.reply({ embeds: [errorEmbed('Not Found', `No tournament with code \`${code}\`.`)], ephemeral: true });
        }

        if (tournament.status === 'completed') {
            return interaction.reply({ embeds: [errorEmbed('Already Ended', 'This tournament has already been completed.')], ephemeral: true });
        }

        await interaction.deferReply();

        // Get bracket state for final results
        const bracketState = getBracketState(tournament.id);
        const rounds = Object.keys(bracketState).sort((a, b) => Number(b) - Number(a));

        // Find champion (winner of the last round)
        let champion = null;
        if (rounds.length > 0) {
            const finalRound = bracketState[rounds[0]];
            const finalMatch = finalRound.find(m => m.winner);
            if (finalMatch) {
                champion = finalMatch.winner;
            }
        }

        // Update status
        tournaments.updateStatus(tournament.id, 'completed');

        logOwnerAction(interaction.guild.id, interaction.user.id, 'END_TOURNAMENT', code, { champion });

        // Build results
        let resultsText = `## 🏁 Tournament Ended: **${tournament.name}**\n\n`;

        if (champion) {
            resultsText += `## 🏆 Champion: **${champion}**\n\n`;
        }

        resultsText += '### 📊 Final Bracket:\n';

        for (const round of rounds.sort((a, b) => Number(a) - Number(b))) {
            const roundLabel = Number(round) === Number(rounds[rounds.length - 1]) ? 'Final' : `Round ${round}`;
            resultsText += `\n**${roundLabel}:**\n`;

            for (const match of bracketState[round]) {
                const winnerTag = match.winner ? ` → 🏆 **${match.winner}**` : '';
                resultsText += `- ${match.team1} vs ${match.team2}${winnerTag}\n`;
            }
        }

        // Clean up match channels after 30 seconds
        const allMatches = matchDb.getByTournament(tournament.id);
        for (const match of allMatches) {
            if (match.channel_id) {
                try {
                    const channel = await interaction.guild.channels.fetch(match.channel_id);
                    if (channel) {
                        await channel.send({ content: '🏁 **Tournament ended.** This channel will be deleted in 60 seconds.' });
                        setTimeout(() => channel.delete('Tournament ended').catch(() => { }), 60_000);
                    }
                } catch (_) { }
            }
        }

        await interaction.editReply({
            content: resultsText,
            embeds: [successEmbed('Tournament Complete', `**${tournament.name}** has concluded.${champion ? `\n\n🏆 Champion: **${champion}**` : ''}`)],
        });

        logger.info(`Tournament ended: ${tournament.name} (${code})`);
    },
};
