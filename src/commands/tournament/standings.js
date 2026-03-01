const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { tournaments, teams: teamDb, matches: matchDb, players } = require('../../database/db');
const { errorEmbed } = require('../../utils/embeds');
const { embedColor, botName } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('standings')
        .setDescription('📊 View tournament standings — teams, wins, losses')
        .addStringOption(opt =>
            opt.setName('tournament_id').setDescription('Tournament code (e.g. OUT-XXXXX)').setRequired(true)
        ),

    async execute(interaction) {
        const code = interaction.options.getString('tournament_id').toUpperCase().trim();
        const tournament = tournaments.getByCode(code);

        if (!tournament) {
            return interaction.reply({ embeds: [errorEmbed('Not Found', `No tournament with code \`${code}\`.`)], ephemeral: true });
        }

        const registeredTeams = tournaments.getRegisteredTeams(tournament.id);

        if (registeredTeams.length === 0) {
            return interaction.reply({
                embeds: [errorEmbed('No Teams', `No teams registered for **${tournament.name}**.`)],
                ephemeral: true,
            });
        }

        // Calculate team stats from matches
        const allMatches = matchDb.getByTournament(tournament.id);
        const teamStats = {};

        for (const team of registeredTeams) {
            teamStats[team.id] = { team, wins: 0, losses: 0, pending: 0 };
        }

        for (const match of allMatches) {
            if (match.winner_id) {
                if (teamStats[match.winner_id]) teamStats[match.winner_id].wins++;
                const loserId = match.team1_id === match.winner_id ? match.team2_id : match.team1_id;
                if (loserId && teamStats[loserId]) teamStats[loserId].losses++;
            } else if (match.team1_id && match.team2_id) {
                if (teamStats[match.team1_id]) teamStats[match.team1_id].pending++;
                if (teamStats[match.team2_id]) teamStats[match.team2_id].pending++;
            }
        }

        // Sort by wins desc, then losses asc
        const sorted = Object.values(teamStats).sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.losses - b.losses;
        });

        const lines = sorted.map((s, i) => {
            const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
            const members = teamDb.getMembers(s.team.id);
            const memberList = members.map(m => `<@${m.discord_id}>`).join(', ');
            const captain = `<@${s.team.captain_id}>`;

            return `${rank} **${s.team.name}**\n` +
                `📊 W: **${s.wins}** | L: **${s.losses}**${s.pending ? ` | ⏳ ${s.pending} pending` : ''}\n` +
                `👑 ${captain} • 👥 ${memberList}`;
        });

        const statusText = tournament.status === 'registration' ? '🟢 Registration Open' :
            tournament.status === 'active' ? '🔴 In Progress' : '🏁 Completed';

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`📊 Standings — ${tournament.name}`)
            .setDescription(`**Status:** ${statusText}\n**Game:** ${tournament.game} • **Format:** ${tournament.format}\n\n${lines.join('\n\n')}`)
            .setFooter({ text: `${botName} • ${registeredTeams.length} teams • ${code}` })
            .setTimestamp();

        // Public response — visible to everyone
        await interaction.reply({ embeds: [embed] });
    },
};
