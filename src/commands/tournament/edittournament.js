const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments } = require('../../database/db');
const { successEmbed, errorEmbed, tournamentEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const selectHandler = require('../../interactions/selectMenus');
const modalHandler = require('../../interactions/modals');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edittournament')
        .setDescription('✏️ Edit tournament settings (Server Owner only)')
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

        // Show editable fields
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`edittourney_field_${tournament.id}_${interaction.user.id}`)
            .setPlaceholder('Select a field to edit...')
            .addOptions([
                { label: 'Tournament Name', value: 'name', emoji: '📝' },
                { label: 'Max Teams', value: 'max_teams', emoji: '👥' },
                { label: 'Start Time', value: 'start_time', emoji: '📅' },
                { label: 'Check-in Window', value: 'checkin_window', emoji: '⏰' },
                { label: 'Prize Pool', value: 'prize_pool', emoji: '🏅' },
                { label: 'Entry Fee', value: 'entry_fee', emoji: '💰' },
            ]);

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({
            content: `## ✏️ Edit Tournament: **${tournament.name}**\nSelect a field to change:`,
            embeds: [tournamentEmbed(tournament)],
            components: [row],
            ephemeral: true,
        });
    },
};

// ─── Field selected → show modal ─────────────────────────────
selectHandler.register('edittourney_field_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const tournamentId = parseInt(parts[2]);
    const originalUserId = parts[3];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ Not your session.', ephemeral: true });
    }

    const field = interaction.values[0];
    const tournament = tournaments.getById(tournamentId);

    const modal = new ModalBuilder()
        .setCustomId(`edittourney_save_${tournamentId}_${field}_${interaction.user.id}`)
        .setTitle(`Edit: ${field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`);

    const currentValue = tournament[field] !== null && tournament[field] !== undefined
        ? String(tournament[field])
        : '';

    const input = new TextInputBuilder()
        .setCustomId('new_value')
        .setLabel(`New value (current: ${currentValue || 'none'})`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(currentValue);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
});

// ─── Save edited value ──────────────────────────────────────
modalHandler.register('edittourney_save_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const tournamentId = parseInt(parts[2]);
    const field = parts[3];
    const originalUserId = parts[4];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ Not your session.', ephemeral: true });
    }

    let newValue = interaction.fields.getTextInputValue('new_value');

    // Convert numeric fields
    if (['max_teams', 'checkin_window', 'team_size'].includes(field)) {
        newValue = parseInt(newValue);
        if (isNaN(newValue)) {
            return interaction.reply({ embeds: [errorEmbed('Invalid Value', 'This field requires a number.')], ephemeral: true });
        }
    }

    const oldTournament = tournaments.getById(tournamentId);
    tournaments.update(tournamentId, { [field]: newValue });

    logOwnerAction(interaction.guild.id, interaction.user.id, 'EDIT_TOURNAMENT', oldTournament.tournament_code, {
        field,
        oldValue: oldTournament[field],
        newValue,
    });

    const updated = tournaments.getById(tournamentId);

    logger.info(`Tournament edited: ${updated.tournament_code} → ${field} = ${newValue}`);

    await interaction.reply({
        embeds: [
            successEmbed('Tournament Updated', `**${field.replace(/_/g, ' ')}** has been updated.`),
            tournamentEmbed(updated),
        ],
        ephemeral: true,
    });
});
