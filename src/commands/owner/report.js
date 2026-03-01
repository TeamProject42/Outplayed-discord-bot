const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ownerOnly } = require('../../middleware/ownerOnly');
const { tournaments, matches: matchDb, teams: teamDb } = require('../../database/db');
const { errorEmbed } = require('../../utils/embeds');
const { embedColor, botName } = require('../../config');
const { getBracketState } = require('../../utils/bracketEngine');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('📊 Generate a full tournament report (Server Owner only)')
        .addStringOption(opt =>
            opt.setName('tournament_id').setDescription('Tournament code (e.g. OUT-XXXXX)').setRequired(true)
        ),

    async execute(interaction) {
        const isOwner = await ownerOnly(interaction);
        if (!isOwner) return;

        const code = interaction.options.getString('tournament_id').toUpperCase().trim();
        const tournament = tournaments.getByCode(code);

        if (!tournament) {
            return interaction.reply({ embeds: [errorEmbed('Not Found', `No tournament with code \`${code}\`.`)], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const registeredTeams = tournaments.getRegisteredTeams(tournament.id);
        const allMatches = matchDb.getByTournament(tournament.id);

        // Determine champion
        let champion = null;
        if (tournament.status === 'completed' || tournament.status === 'active') {
            const bracketState = getBracketState(tournament.id);
            const rounds = Object.keys(bracketState).sort((a, b) => Number(b) - Number(a));
            if (rounds.length > 0) {
                const finalRound = bracketState[rounds[0]];
                const finalMatch = finalRound.find(m => m.winner);
                if (finalMatch) champion = finalMatch.winner;
            }
        }

        // Status label
        const statusLabel = {
            registration: '🟢 Registration Open',
            registration_closed: '🟡 Registration Closed',
            active: '🔴 In Progress',
            completed: '🏁 Completed',
        }[tournament.status] || tournament.status;

        // ─── Build Report ────────────────────────────────────────
        let report = `# 📊 Tournament Report\n`;
        report += `## ${tournament.name}\n\n`;
        report += `**Code:** \`${code}\`\n`;
        report += `**Status:** ${statusLabel}\n`;
        report += `**Game:** ${tournament.game}\n`;
        report += `**Format:** ${tournament.format}\n`;
        report += `**Team Size:** ${tournament.team_size}\n`;
        report += `**Teams:** ${registeredTeams.length}/${tournament.max_teams}\n`;
        if (tournament.prize_pool) report += `**Prize Pool:** ${tournament.prize_pool}\n`;
        if (tournament.entry_fee) report += `**Entry Fee:** ${tournament.entry_fee}\n`;
        if (champion) report += `**🏆 Champion:** ${champion}\n`;

        // Team stats from matches
        const teamStats = {};
        for (const team of registeredTeams) {
            teamStats[team.id] = { wins: 0, losses: 0 };
        }
        for (const match of allMatches) {
            if (match.winner_id) {
                if (teamStats[match.winner_id]) teamStats[match.winner_id].wins++;
                const loserId = match.team1_id === match.winner_id ? match.team2_id : match.team1_id;
                if (loserId && teamStats[loserId]) teamStats[loserId].losses++;
            }
        }

        report += `\n---\n\n## 👥 Teams (${registeredTeams.length})\n`;
        for (const team of registeredTeams) {
            const members = teamDb.getMembers(team.id);
            const memberList = members.map(m => `  • <@${m.discord_id}> — ${m.player_id} (${m.rank})`).join('\n');
            const stats = teamStats[team.id];
            report += `\n**${team.name}** (\`${team.code}\`) — W: ${stats?.wins || 0} | L: ${stats?.losses || 0}\n`;
            report += `👑 Captain: <@${team.captain_id}>\n`;
            report += `${memberList}\n`;
        }

        if (allMatches.length > 0) {
            report += `\n---\n\n## ⚔️ Matches (${allMatches.length})\n`;
            for (const match of allMatches) {
                const t1 = teamDb.getById(match.team1_id);
                const t2 = teamDb.getById(match.team2_id);
                const t1Name = t1?.name || 'BYE';
                const t2Name = t2?.name || 'BYE';
                const status = match.winner_id
                    ? `🏆 ${teamDb.getById(match.winner_id)?.name || 'Unknown'}`
                    : `⏳ ${match.status}`;
                report += `• R${match.round} M${match.match_number}: **${t1Name}** vs **${t2Name}** → ${status}\n`;
            }
        }

        report += `\n---\n*Report generated: ${new Date().toLocaleString()}*`;

        // Send as DM to owner (handles long reports)
        try {
            const chunks = [];
            for (let i = 0; i < report.length; i += 2000) {
                chunks.push(report.substring(i, i + 2000));
            }

            const owner = await interaction.guild.fetchOwner();
            for (const chunk of chunks) {
                await owner.send({ content: chunk });
            }

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle('📊 Report Sent!')
                    .setDescription(`Full report for **${tournament.name}** has been sent to your DMs.\n\n**Status:** ${statusLabel}\n**Teams:** ${registeredTeams.length}\n**Matches:** ${allMatches.length}${champion ? `\n**Champion:** ${champion}` : ''}`)
                    .setFooter({ text: `${botName} • ${code}` })
                    .setTimestamp()],
            });
        } catch (err) {
            // If DMs are closed, post in the channel instead
            await interaction.editReply({ content: report.substring(0, 2000) });
            if (report.length > 2000) {
                await interaction.followUp({ content: report.substring(2000, 4000), ephemeral: true });
            }
        }
    },
};
