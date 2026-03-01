const { SlashCommandBuilder } = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments, matches: matchDb, teams: teamDb } = require('../../database/db');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { getBracketState } = require('../../utils/bracketEngine');
const logger = require('../../utils/logger');
const { ChannelType } = require('discord.js');

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

        // Clean up match channels after 60 seconds
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

        // Clean up team channels (text + voice) for teams in this tournament
        const registeredTeamsCleanup = tournaments.getRegisteredTeams(tournament.id);
        const categoryIds = new Set();

        for (const team of registeredTeamsCleanup) {
            if (team.category_id) categoryIds.add(team.category_id);

            if (team.channel_id) {
                try {
                    const ch = await interaction.guild.channels.fetch(team.channel_id);
                    if (ch) {
                        await ch.send({ content: '🏁 **Tournament ended.** Team channel will be deleted in 60 seconds.' });
                        setTimeout(() => ch.delete('Tournament ended').catch(() => { }), 60_000);
                    }
                } catch (_) { }
            }
            if (team.voice_channel_id) {
                try {
                    const vc = await interaction.guild.channels.fetch(team.voice_channel_id);
                    if (vc) setTimeout(() => vc.delete('Tournament ended').catch(() => { }), 60_000);
                } catch (_) { }
            }

            // Dissolve team from DB — members are freed, team no longer exists
            tournaments.unregisterTeam(tournament.id, team.id);
            teamDb.delete(team.id);
        }

        // Clean up empty game categories after channels are deleted (90s delay)
        setTimeout(async () => {
            for (const catId of categoryIds) {
                try {
                    const cat = await interaction.guild.channels.fetch(catId);
                    if (cat && cat.type === ChannelType.GuildCategory && cat.children.cache.size === 0) {
                        await cat.delete('Empty game category after tournament end').catch(() => { });
                    }
                } catch (_) { }
            }
        }, 90_000);

        await interaction.editReply({
            content: resultsText,
            embeds: [successEmbed('Tournament Complete', `**${tournament.name}** has concluded.${champion ? `\n\n🏆 Champion: **${champion}**` : ''}`)],
        });

        // ─── Send Tournament Report to Owner ─────────────────────
        try {
            const registeredTeamsReport = tournaments.getRegisteredTeams(tournament.id);
            const allMatchesReport = matchDb.getByTournament(tournament.id);

            let report = `# 📊 Tournament Report: ${tournament.name}\n`;
            report += `**Code:** \`${code}\`\n`;
            report += `**Game:** ${tournament.game}\n`;
            report += `**Format:** ${tournament.format}\n`;
            report += `**Team Size:** ${tournament.team_size}\n`;
            report += `**Total Teams:** ${registeredTeamsReport.length}/${tournament.max_teams}\n`;
            report += champion ? `**🏆 Champion:** ${champion}\n` : '';
            report += `\n---\n\n## 👥 Participating Teams\n`;

            for (const team of registeredTeamsReport) {
                const members = teamDb.getMembers(team.id);
                const memberList = members.map(m => `• <@${m.discord_id}> (${m.player_id} — ${m.rank})`).join('\n');
                report += `\n### ${team.name} (\`${team.code}\`)\n`;
                report += `👑 Captain: <@${team.captain_id}>\n`;
                report += `${memberList}\n`;
            }

            report += `\n---\n\n## ⚔️ Match Results\n`;
            for (const match of allMatchesReport) {
                const t1 = teamDb.getById(match.team1_id);
                const t2 = teamDb.getById(match.team2_id);
                const t1Name = t1?.name || 'BYE';
                const t2Name = t2?.name || 'BYE';
                const winner = match.winner_id ? (teamDb.getById(match.winner_id)?.name || 'Unknown') : 'No result';
                report += `• R${match.round} M${match.match_number}: **${t1Name}** vs **${t2Name}** → 🏆 ${winner}\n`;
            }

            report += `\n---\n*Report generated at ${new Date().toLocaleString()}*`;

            // DM the owner
            const owner = await interaction.guild.fetchOwner();
            await owner.send({ content: report.substring(0, 2000) });
            if (report.length > 2000) {
                await owner.send({ content: report.substring(2000, 4000) });
            }
        } catch (err) {
            console.log(`⚠️ Could not send tournament report DM: ${err.message}`);
        }

        logger.info(`Tournament ended: ${tournament.name} (${code})`);
    },
};
