const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ownerOnly } = require('../../middleware/ownerOnly');
const { teams: teamDb, tournaments, players } = require('../../database/db');
const { errorEmbed } = require('../../utils/embeds');
const config = require('../../config');
const { embedColor, botName } = config;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverdashboard')
        .setDescription('📊 View all active teams, tournaments, and server stats (Admin only)'),

    async execute(interaction) {
        const isOwner = await ownerOnly(interaction);
        if (!isOwner) return;

        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;
        const allTeams = teamDb.getAll();
        const activeTournaments = tournaments.getActive(guildId);
        const pastTournaments = tournaments.getPast(guildId);

        const embeds = [];

        // ─── Overview Embed ─────────────────────────────────
        const overviewEmbed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`📊 Server Dashboard — ${interaction.guild.name}`)
            .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '🛡️ Active Teams', value: `${allTeams.length}`, inline: true },
                { name: '🏆 Active Tournaments', value: `${activeTournaments.length}`, inline: true },
                { name: '📜 Past Tournaments', value: `${pastTournaments.length}`, inline: true },
            )
            .setFooter({ text: `${botName} • Dashboard` })
            .setTimestamp();
        embeds.push(overviewEmbed);

        // ─── Active Teams by Game ───────────────────────────
        if (allTeams.length > 0) {
            // Group teams by the captain's game
            const teamsByGame = {};
            for (const team of allTeams) {
                const captain = players.get(team.captain_id);
                const gameName = captain?.game || 'Unknown';
                if (!teamsByGame[gameName]) teamsByGame[gameName] = [];
                teamsByGame[gameName].push(team);
            }

            let teamDesc = '';
            for (const [game, gameTeams] of Object.entries(teamsByGame)) {
                // Find the game emoji
                const gameKey = Object.keys(config.games).find(k => config.games[k].name === game);
                const emoji = gameKey ? config.games[gameKey].emoji : '🎮';

                teamDesc += `### ${emoji} ${game}\n`;
                for (const t of gameTeams) {
                    const members = teamDb.getMembers(t.id);
                    const memberMentions = members.map(m => `<@${m.discord_id}>`).join(', ');
                    const status = t.locked ? '🔒' : '🔓';
                    teamDesc += `${status} **${t.name}** (\`${t.code}\`) — ${t.current_size}/${t.size} — 👑 <@${t.captain_id}>\n`;
                    teamDesc += `┗ ${memberMentions || 'No members'}\n`;
                }
                teamDesc += '\n';
            }

            // Discord embeds have a 4096 char description limit; split if needed
            if (teamDesc.length <= 4000) {
                const teamsEmbed = new EmbedBuilder()
                    .setColor(embedColor)
                    .setTitle('🛡️ Active Teams')
                    .setDescription(teamDesc.trim())
                    .setFooter({ text: `${botName} • ${allTeams.length} team(s)` });
                embeds.push(teamsEmbed);
            } else {
                // Split by game sections
                for (const [game, gameTeams] of Object.entries(teamsByGame)) {
                    const gameKey = Object.keys(config.games).find(k => config.games[k].name === game);
                    const emoji = gameKey ? config.games[gameKey].emoji : '🎮';

                    let section = '';
                    for (const t of gameTeams) {
                        const members = teamDb.getMembers(t.id);
                        const memberMentions = members.map(m => `<@${m.discord_id}>`).join(', ');
                        const status = t.locked ? '🔒' : '🔓';
                        section += `${status} **${t.name}** (\`${t.code}\`) — ${t.current_size}/${t.size} — 👑 <@${t.captain_id}>\n`;
                        section += `┗ ${memberMentions || 'No members'}\n`;
                    }

                    embeds.push(
                        new EmbedBuilder()
                            .setColor(embedColor)
                            .setTitle(`${emoji} Teams — ${game}`)
                            .setDescription(section.trim())
                            .setFooter({ text: `${botName} • ${gameTeams.length} team(s)` })
                    );
                }
            }
        }

        // ─── Active Tournaments ─────────────────────────────
        if (activeTournaments.length > 0) {
            let activeDesc = '';
            for (const t of activeTournaments) {
                const regCount = tournaments.getRegistrationCount(t.id);
                const statusEmoji = t.status === 'active' ? '🟢' : t.status === 'registration' ? '📝' : '🔒';
                const statusLabel = t.status === 'active' ? 'In Progress' : t.status === 'registration' ? 'Registration Open' : 'Registration Closed';
                activeDesc += `${statusEmoji} **${t.name}** (\`${t.tournament_code}\`)\n`;
                activeDesc += `┣ 🎮 ${t.game} • 👥 ${t.team_size}v${t.team_size} • 📋 ${t.format}\n`;
                activeDesc += `┣ 📊 ${regCount}/${t.max_teams} teams registered\n`;
                activeDesc += `┗ ${statusLabel}\n\n`;
            }

            embeds.push(
                new EmbedBuilder()
                    .setColor(0x22C55E)
                    .setTitle('🏆 Active Tournaments')
                    .setDescription(activeDesc.trim())
                    .setFooter({ text: `${botName} • ${activeTournaments.length} active` })
            );
        }

        // ─── Past Tournaments ───────────────────────────────
        if (pastTournaments.length > 0) {
            const recentPast = pastTournaments.slice(0, 10); // Show max 10
            let pastDesc = '';
            for (const t of recentPast) {
                const statusEmoji = t.status === 'completed' ? '✅' : '❌';
                const statusLabel = t.status === 'completed' ? 'Completed' : 'Cancelled';
                pastDesc += `${statusEmoji} **${t.name}** (\`${t.tournament_code}\`)\n`;
                pastDesc += `┣ 🎮 ${t.game} • 👥 ${t.team_size}v${t.team_size} • 📋 ${t.format}\n`;
                pastDesc += `┗ ${statusLabel}\n\n`;
            }

            if (pastTournaments.length > 10) {
                pastDesc += `*...and ${pastTournaments.length - 10} more*`;
            }

            embeds.push(
                new EmbedBuilder()
                    .setColor(0x6B7280)
                    .setTitle('📜 Past Tournaments')
                    .setDescription(pastDesc.trim())
                    .setFooter({ text: `${botName} • ${pastTournaments.length} total` })
            );
        }

        // Discord allows max 10 embeds per message
        await interaction.editReply({ embeds: embeds.slice(0, 10) });
    },
};
