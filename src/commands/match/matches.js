const {
    SlashCommandBuilder,
    EmbedBuilder,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { errorEmbed, matchEmbed, infoEmbed } = require('../../utils/embeds');
const { formatDate, formatTime } = require('../../utils/helpers');
const { getGameKeys, getGame } = require('../../utils/gameConstants');
const config = require('../../config');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('matches')
        .setDescription('View your match schedule')
        .addSubcommand(sub =>
            sub.setName('upcoming')
                .setDescription('View your upcoming matches'))
        .addSubcommand(sub =>
            sub.setName('history')
                .setDescription('View your past matches')),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'upcoming') return handleUpcoming(interaction);
        if (sub === 'history') return handleHistory(interaction);
    },
};

async function handleUpcoming(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    await interaction.deferReply();

    // Get user's tournament participations
    const { data: participations } = await supabase
        .from('User_Tournament_Participation')
        .select('Tournament_UUID, Franchise_UUID')
        .eq('User_UUID', user.UUID);

    if (!participations || participations.length === 0) {
        return interaction.editReply({
            embeds: [infoEmbed('📅 No Matches', 'You\'re not registered for any tournaments. Use `/tournaments list` to browse.')],
        });
    }

    const tournamentUUIDs = participations.map(p => p.Tournament_UUID);

    // Get upcoming matches for these tournaments
    const { data: matches, error } = await supabase
        .from('Match')
        .select('*')
        .in('Tournament_UUID', tournamentUUIDs)
        .in('Status', ['scheduled', 'pending', 'live'])
        .order('Date', { ascending: true })
        .order('Start_Time', { ascending: true })
        .limit(10);

    if (error || !matches || matches.length === 0) {
        return interaction.editReply({
            embeds: [infoEmbed('📅 No Upcoming Matches', 'You have no upcoming matches scheduled.')],
        });
    }

    // Build match list
    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('📅 Upcoming Matches')
        .setDescription(matches.map((m, i) => {
            let line = `**${i + 1}. Match** \`${m.Match_UUID}\`\n`;
            line += `📅 ${formatDate(m.Date)} | 🕐 ${formatTime(m.Start_Time)} — ${formatTime(m.End_Time)}\n`;
            line += `📊 Status: ${m.Status}${m.Is_Live ? ' 🔴 LIVE' : ''}`;
            if (m.Party_Code) line += `\n🔑 Code: \`${m.Party_Code}\``;
            return line;
        }).join('\n\n'))
        .setFooter({ text: `${config.botName} • Use /checkin <match_id> to check in` })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

async function handleHistory(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    await interaction.deferReply();

    // Get user's tournament participations
    const { data: participations } = await supabase
        .from('User_Tournament_Participation')
        .select('Tournament_UUID, Franchise_UUID')
        .eq('User_UUID', user.UUID);

    if (!participations || participations.length === 0) {
        return interaction.editReply({
            embeds: [infoEmbed('📊 No Match History', 'You haven\'t participated in any tournaments yet.')],
        });
    }

    const tournamentUUIDs = participations.map(p => p.Tournament_UUID);

    // Get completed matches
    const { data: matches } = await supabase
        .from('Match')
        .select('*')
        .in('Tournament_UUID', tournamentUUIDs)
        .eq('Status', 'completed')
        .order('Date', { ascending: false })
        .limit(10);

    if (!matches || matches.length === 0) {
        return interaction.editReply({
            embeds: [infoEmbed('📊 No Match History', 'No completed matches found.')],
        });
    }

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('📊 Match History')
        .setDescription(matches.map((m, i) => {
            let line = `**${i + 1}.** \`${m.Match_UUID}\`\n`;
            line += `📅 ${formatDate(m.Date)} | Score: ${m.Score || 'N/A'}`;
            return line;
        }).join('\n\n'))
        .setFooter({ text: config.botName })
        .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}
