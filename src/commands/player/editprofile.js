const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { games } = require('../../config');
const { players } = require('../../database/db');
const { successEmbed, errorEmbed, profileEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const selectHandler = require('../../interactions/selectMenus');
const modalHandler = require('../../interactions/modals');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editprofile')
        .setDescription('✏️ Edit your player profile'),

    async execute(interaction) {
        const player = players.get(interaction.user.id);
        if (!player) {
            return interaction.reply({
                embeds: [errorEmbed('No Profile', 'You don\'t have a profile yet! Use `/start` to create one.')],
                ephemeral: true,
            });
        }

        // Show dropdown: what to edit
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`editprofile_field_${interaction.user.id}`)
            .setPlaceholder('What would you like to edit?')
            .addOptions([
                { label: 'Player ID', value: 'player_id', emoji: '🆔', description: 'Change your in-game username/ID' },
                { label: 'Rank', value: 'rank', emoji: '🏅', description: 'Update your current rank' },
            ]);

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.reply({
            content: '## ✏️ Edit Profile\nSelect what you\'d like to change:',
            components: [row],
            ephemeral: true,
        });
    },
};

// ─── Field selected ──────────────────────────────────────────
selectHandler.register('editprofile_field_', async (interaction) => {
    const originalUserId = interaction.customId.split('_')[2];
    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ This is not your edit session.', ephemeral: true });
    }

    const field = interaction.values[0];
    const player = players.get(interaction.user.id);

    if (field === 'player_id') {
        // Show modal for new Player ID
        const modal = new ModalBuilder()
            .setCustomId(`editprofile_pid_${interaction.user.id}`)
            .setTitle('Edit Player ID');

        const pidInput = new TextInputBuilder()
            .setCustomId('new_player_id')
            .setLabel('New Player ID / Username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50)
            .setValue(player.player_id);

        modal.addComponents(new ActionRowBuilder().addComponents(pidInput));
        await interaction.showModal(modal);
    } else if (field === 'rank') {
        // Find game's ranks
        const gameEntry = Object.values(games).find(g => g.name === player.game);
        if (!gameEntry) {
            return interaction.update({
                content: '❌ Could not find rank options for your game.',
                components: [],
            });
        }

        const rankOptions = gameEntry.ranks.map(rank => ({
            label: rank,
            value: rank,
            default: rank === player.rank,
        }));

        const rankMenu = new StringSelectMenuBuilder()
            .setCustomId(`editprofile_rank_${interaction.user.id}`)
            .setPlaceholder('Select your new rank...')
            .addOptions(rankOptions);

        const row = new ActionRowBuilder().addComponents(rankMenu);

        await interaction.update({
            content: `## 🏅 Update Rank\n**Current rank:** ${player.rank}\n\nSelect your new rank:`,
            components: [row],
        });
    }
});

// ─── Player ID updated via modal ─────────────────────────────
modalHandler.register('editprofile_pid_', async (interaction) => {
    const originalUserId = interaction.customId.split('_')[2];
    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ This is not your edit session.', ephemeral: true });
    }

    const newPid = interaction.fields.getTextInputValue('new_player_id');
    players.update(interaction.user.id, { player_id: newPid });

    const updated = players.get(interaction.user.id);
    logger.info(`Profile edited: ${interaction.user.tag} → player_id = ${newPid}`);

    await interaction.reply({
        embeds: [
            successEmbed('Profile Updated', `Your Player ID has been changed to \`${newPid}\`.`),
            profileEmbed(updated, interaction.user),
        ],
        ephemeral: true,
    });
});

// ─── Rank updated via select menu ────────────────────────────
selectHandler.register('editprofile_rank_', async (interaction) => {
    const originalUserId = interaction.customId.split('_')[2];
    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ This is not your edit session.', ephemeral: true });
    }

    const newRank = interaction.values[0];
    players.update(interaction.user.id, { rank: newRank });

    const updated = players.get(interaction.user.id);
    logger.info(`Profile edited: ${interaction.user.tag} → rank = ${newRank}`);

    await interaction.update({
        content: null,
        embeds: [
            successEmbed('Profile Updated', `Your rank has been updated to **${newRank}**.`),
            profileEmbed(updated, interaction.user),
        ],
        components: [],
    });
});
