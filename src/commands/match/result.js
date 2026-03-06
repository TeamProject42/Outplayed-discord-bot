const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { generateUUID } = require('../../utils/helpers');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('result')
        .setDescription('Submit a match result')
        .addStringOption(opt =>
            opt.setName('match_id')
                .setDescription('Match UUID')
                .setRequired(true)),

    async execute(interaction) {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        const matchId = interaction.options.getString('match_id');

        // Get match
        const { data: match } = await supabase
            .from('Match')
            .select('*')
            .eq('Match_UUID', matchId)
            .single();

        if (!match) {
            return interaction.reply({
                embeds: [errorEmbed('Not Found', `Match \`${matchId}\` not found.`)],
                ephemeral: true,
            });
        }

        if (match.Status === 'completed') {
            return interaction.reply({
                embeds: [errorEmbed('Already Completed', 'Results have already been submitted for this match.')],
                ephemeral: true,
            });
        }

        // Show result modal
        const modal = new ModalBuilder()
            .setCustomId(`result_modal_${matchId}`)
            .setTitle('Submit Match Result');

        const scoreInput = new TextInputBuilder()
            .setCustomId('match_score')
            .setLabel('Score (e.g. "3-1" or team placement)')
            .setPlaceholder('Enter the match score or result')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

        const notesInput = new TextInputBuilder()
            .setCustomId('match_notes')
            .setLabel('Notes (optional)')
            .setPlaceholder('Any additional notes about the match')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500);

        modal.addComponents(
            new ActionRowBuilder().addComponents(scoreInput),
            new ActionRowBuilder().addComponents(notesInput),
        );

        await interaction.showModal(modal);
    },
};

/**
 * Handle result modal submission
 */
async function handleResultModal(interaction) {
    const matchId = interaction.customId.replace('result_modal_', '');
    const score = interaction.fields.getTextInputValue('match_score');
    const notes = interaction.fields.getTextInputValue('match_notes') || null;

    await interaction.deferReply({ ephemeral: true });

    // Update match with score
    const { error } = await supabase
        .from('Match')
        .update({
            Score: score,
            Status: 'pending_confirmation',
        })
        .eq('Match_UUID', matchId);

    if (error) {
        logger.error('Result submission error:', error);
        return interaction.editReply({
            embeds: [errorEmbed('Failed', `Could not submit result: ${error.message}`)],
        });
    }

    // Create notification for match result
    const notiUUID = generateUUID('noti-');

    return interaction.editReply({
        embeds: [successEmbed('Result Submitted', `**Match:** \`${matchId}\`\n**Score:** ${score}\n\nWaiting for opponent confirmation. The organizer can also finalize the result.`)],
    });
}

/**
 * Handle result confirm button
 */
async function handleResultConfirm(interaction) {
    const matchId = interaction.customId.replace('result_confirm_', '');

    await interaction.deferUpdate();

    // Finalize match
    await supabase
        .from('Match')
        .update({ Status: 'completed' })
        .eq('Match_UUID', matchId);

    return interaction.editReply({
        content: '',
        embeds: [successEmbed('Result Confirmed', `Match \`${matchId}\` has been finalized.`)],
        components: [],
    });
}

/**
 * Handle result deny button
 */
async function handleResultDeny(interaction) {
    const matchId = interaction.customId.replace('result_deny_', '');

    await interaction.deferUpdate();

    // Reset match status
    await supabase
        .from('Match')
        .update({ Status: 'disputed', Score: null })
        .eq('Match_UUID', matchId);

    return interaction.editReply({
        content: '',
        embeds: [errorEmbed('Result Disputed', `Match \`${matchId}\` result has been disputed. The organizer will review.`)],
        components: [],
    });
}

module.exports.handleResultModal = handleResultModal;
module.exports.handleResultConfirm = handleResultConfirm;
module.exports.handleResultDeny = handleResultDeny;
