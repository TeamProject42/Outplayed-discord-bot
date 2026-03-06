const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const config = require('../../config');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkin')
        .setDescription('Check in for your upcoming match')
        .addStringOption(opt =>
            opt.setName('match_id')
                .setDescription('Match UUID')
                .setRequired(true)),

    async execute(interaction) {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply({ ephemeral: true });

        const matchId = interaction.options.getString('match_id');

        // Get match
        const { data: match, error } = await supabase
            .from('Match')
            .select('*')
            .eq('Match_UUID', matchId)
            .single();

        if (error || !match) {
            return interaction.editReply({
                embeds: [errorEmbed('Not Found', `Match \`${matchId}\` not found.`)],
            });
        }

        if (match.Status === 'completed' || match.Status === 'cancelled') {
            return interaction.editReply({
                embeds: [errorEmbed('Match Over', 'This match has already ended.')],
            });
        }

        // Verify user is a participant
        const { data: participation } = await supabase
            .from('User_Tournament_Participation')
            .select('Franchise_UUID')
            .eq('Tournament_UUID', match.Tournament_UUID)
            .eq('User_UUID', user.UUID)
            .single();

        if (!participation) {
            return interaction.editReply({
                embeds: [errorEmbed('Not a Participant', 'You\'re not registered for this tournament.')],
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.successColor)
            .setTitle('✅ Checked In!')
            .setDescription(`You've checked in for the match.\n\n**Match:** \`${matchId}\`\n**Date:** ${match.Date}\n**Time:** ${match.Start_Time} — ${match.End_Time}\n**Status:** ${match.Status}`)
            .setFooter({ text: config.botName })
            .setTimestamp();

        // Add lobby details if available
        if (match.Party_Code) {
            embed.addFields({ name: '🔑 Party Code', value: match.Party_Code, inline: true });
        }
        if (match.Match_Link) {
            embed.addFields({ name: '🔗 Match Link', value: match.Match_Link, inline: true });
        }

        logger.info(`${interaction.user.tag} checked in for match ${matchId}`);
        return interaction.editReply({ embeds: [embed] });
    },
};

/**
 * Handle check-in button click
 */
async function handleCheckinButton(interaction) {
    const matchId = interaction.customId.replace('checkin_', '');
    const user = await ensureRegistered(interaction);
    if (!user) return;

    await interaction.deferReply({ ephemeral: true });

    const { data: match } = await supabase
        .from('Match')
        .select('Match_UUID, Date, Start_Time, Status')
        .eq('Match_UUID', matchId)
        .single();

    if (!match || match.Status === 'completed') {
        return interaction.editReply({
            embeds: [errorEmbed('Invalid', 'This match is no longer available for check-in.')],
        });
    }

    return interaction.editReply({
        embeds: [successEmbed('Checked In!', `You've checked in for match \`${matchId}\`.\n\n📅 ${match.Date} at ${match.Start_Time}`)],
    });
}

module.exports.handleCheckinButton = handleCheckinButton;
