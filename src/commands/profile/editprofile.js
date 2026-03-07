const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const { handleCommandError } = require('../../utils/errorHandler');
const { ERRORS, TITLES } = require('../../utils/constants');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editprofile')
        .setDescription('Edit your player profile fields')
        .addStringOption(opt =>
            opt.setName('field')
                .setDescription('Which field to edit')
                .setRequired(true)
                .addChoices(
                    { name: '📝 Display Name', value: 'name' },
                    { name: '🌍 Region', value: 'region' },
                    { name: '🏳️ Country', value: 'country' },
                    { name: '📧 Email', value: 'email' },
                    { name: '🏫 Institute', value: 'institute' },
                )),

    async execute(interaction) {
        try {
            return await handleEdit(interaction);
        } catch (error) {
            await handleCommandError(interaction, error);
        }
    },
};

async function handleEdit(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        const field = interaction.options.getString('field');

        const fieldLabels = {
            name: 'Display Name',
            region: 'Region',
            country: 'Country',
            email: 'Email',
            institute: 'Institute',
        };

        const dbColumns = {
            name: 'Name',
            region: 'Region',
            country: 'Country',
            email: 'Email',
            institute: 'Institute',
        };

        const modal = new ModalBuilder()
            .setCustomId(`profile_edit_modal_${field}`)
            .setTitle(`Edit ${fieldLabels[field]}`);

        const input = new TextInputBuilder()
            .setCustomId('edit_value')
            .setLabel(`New ${fieldLabels[field]}`)
            .setPlaceholder(`Enter your new ${fieldLabels[field].toLowerCase()}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        if (user[dbColumns[field]]) {
            input.setValue(user[dbColumns[field]]);
        }

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

/**
 * Handle profile edit modal submission.
 */
async function handleProfileEditModal(interaction) {
    try {
        const field = interaction.customId.replace('profile_edit_modal_', '');
        const newValue = interaction.fields.getTextInputValue('edit_value');
        const discordId = interaction.user.id;

        const dbColumns = {
            name: 'Name',
            region: 'Region',
            country: 'Country',
            email: 'Email',
            institute: 'Institute',
        };

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const { error } = await supabase
            .from('User')
            .update({
                [dbColumns[field]]: newValue,
                Updated_At: new Date().toISOString(),
            })
            .eq('Discord_ID', discordId);

        if (error) {
            throw error;
        }

        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `Your **${field}** has been updated to: **${newValue}**`)],
        });
    } catch (err) {
        await handleCommandError(interaction, err);
    }
}

module.exports.handleProfileEditModal = handleProfileEditModal;
