const {
    SlashCommandBuilder,
    EmbedBuilder,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { errorEmbed, infoEmbed } = require('../../utils/embeds');
const { handleCommandError } = require('../../utils/errorHandler');
const { ERRORS, TITLES } = require('../../utils/constants');
const config = require('../../config');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View player statistics')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('Player to view stats for (defaults to you)')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user') || interaction.user;

            // Get user from DB
            const { data: user } = await supabase
                .from('User')
                .select('UUID, Name, Username')
                .eq('Discord_ID', targetUser.id)
                .single();

            if (!user) {
                return interaction.editReply({
                    embeds: [errorEmbed(TITLES.NOT_FOUND, targetUser.id === interaction.user.id
                        ? ERRORS.NOT_REGISTERED
                        : `${targetUser.tag} hasn't registered on Outplayed.`)],
                });
            }

            // Tournament count
            const { count: tournamentCount } = await supabase
                .from('User_Tournament_Participation')
                .select('*', { count: 'exact', head: true })
                .eq('User_UUID', user.UUID);

            // Match history from tournaments the user participated in
            const { data: participations } = await supabase
                .from('User_Tournament_Participation')
                .select('Tournament_UUID')
                .eq('User_UUID', user.UUID);

            let totalMatches = 0;
            let completedMatches = 0;

            if (participations && participations.length > 0) {
                const tournamentUUIDs = participations.map(p => p.Tournament_UUID);

                const { count: total } = await supabase
                    .from('Match')
                    .select('*', { count: 'exact', head: true })
                    .in('Tournament_UUID', tournamentUUIDs);

                const { count: completed } = await supabase
                    .from('Match')
                    .select('*', { count: 'exact', head: true })
                    .in('Tournament_UUID', tournamentUUIDs)
                    .eq('Status', 'completed');

                totalMatches = total || 0;
                completedMatches = completed || 0;
            }

            // Valorant stats if available
            let valoStats = null;
            const { data: valoUser } = await supabase
                .from('User')
                .select('User_ID')
                .eq('UUID', user.UUID)
                .single();

            if (valoUser) {
                const { data: stats } = await supabase
                    .from('ValoTournamentPlayerStatistics')
                    .select('*')
                    .eq('Tournament_Player_ID', valoUser.User_ID);

                if (stats && stats.length > 0) {
                    const totalKills = stats.reduce((sum, s) => sum + (s.Kills || 0), 0);
                    const totalDeaths = stats.reduce((sum, s) => sum + (s.Deaths || 0), 0);
                    const totalAssists = stats.reduce((sum, s) => sum + (s.Assists || 0), 0);
                    const avgACS = Math.round(stats.reduce((sum, s) => sum + (s.ACS || 0), 0) / stats.length);

                    valoStats = {
                        kills: totalKills,
                        deaths: totalDeaths,
                        assists: totalAssists,
                        kd: totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills,
                        acs: avgACS,
                        matches: stats.length,
                    };
                }
            }

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(`📊 ${user.Name || targetUser.tag}'s Stats`)
                .addFields(
                    { name: '🏆 Tournaments', value: `${tournamentCount || 0}`, inline: true },
                    { name: '⚔️ Total Matches', value: `${totalMatches}`, inline: true },
                    { name: '✅ Completed', value: `${completedMatches}`, inline: true },
                )
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 128 }))
                .setFooter({ text: config.botName })
                .setTimestamp();

            if (valoStats) {
                embed.addFields(
                    { name: '\u200B', value: '**🎯 Valorant Stats**' },
                    { name: 'Kills', value: `${valoStats.kills}`, inline: true },
                    { name: 'Deaths', value: `${valoStats.deaths}`, inline: true },
                    { name: 'Assists', value: `${valoStats.assists}`, inline: true },
                    { name: 'K/D', value: `${valoStats.kd}`, inline: true },
                    { name: 'Avg ACS', value: `${valoStats.acs}`, inline: true },
                    { name: 'Matches', value: `${valoStats.matches}`, inline: true },
                );
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            await handleCommandError(interaction, error);
        }
    },
};
