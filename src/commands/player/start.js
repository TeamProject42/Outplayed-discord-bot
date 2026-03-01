const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { games } = require('../../config');
const { players } = require('../../database/db');
const { successEmbed, errorEmbed, profileEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const buttonHandler = require('../../interactions/buttons');
const selectHandler = require('../../interactions/selectMenus');
const modalHandler = require('../../interactions/modals');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('🎮 Create your Outplayed player profile (under 60 seconds!)'),

    async execute(interaction) {
        // Check if player already exists
        const existing = players.get(interaction.user.id);
        if (existing) {
            return interaction.reply({
                embeds: [errorEmbed('Already Registered', 'You already have a profile! Use `/editprofile` to make changes, or `/profile` to view it.')],
                ephemeral: true,
            });
        }

        // Step 1: Game selection buttons
        const rows = [];
        const gameKeys = Object.keys(games);
        const row = new ActionRowBuilder();

        for (const key of gameKeys) {
            const game = games[key];
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`start_game_${key}_${interaction.user.id}`)
                    .setLabel(game.name)
                    .setEmoji(game.emoji)
                    .setStyle(ButtonStyle.Primary)
            );
        }
        rows.push(row);

        await interaction.reply({
            content: '## 🎮 Welcome to Outplayed!\nSelect your primary game to get started:',
            components: rows,
            ephemeral: true,
        });
    },
};

// ─── Step 1 Handler: Game selected → Show Player ID modal ────
buttonHandler.register('start_game_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const gameKey = parts[2];
    const originalUserId = parts[3];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ This is not your onboarding flow.', ephemeral: true });
    }

    // Show modal for Player ID
    const modal = new ModalBuilder()
        .setCustomId(`start_pid_${gameKey}_${interaction.user.id}`)
        .setTitle(`Enter your ${games[gameKey].name} Player ID`);

    const pidInput = new TextInputBuilder()
        .setCustomId('player_id')
        .setLabel('Your in-game Player ID / Username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setPlaceholder('e.g. TenZ#NA1');

    modal.addComponents(new ActionRowBuilder().addComponents(pidInput));
    await interaction.showModal(modal);
});

// ─── Step 2 Handler: Player ID entered → Show rank dropdown ──
modalHandler.register('start_pid_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const gameKey = parts[2];
    const originalUserId = parts[3];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ This is not your onboarding flow.', ephemeral: true });
    }

    const playerId = interaction.fields.getTextInputValue('player_id');
    const game = games[gameKey];

    // Build rank dropdown
    const rankOptions = game.ranks.map(rank => ({
        label: rank,
        value: rank,
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`start_rank_${gameKey}_${playerId.replace(/[^a-zA-Z0-9#]/g, '_')}_${interaction.user.id}`)
        .setPlaceholder('Select your rank...')
        .addOptions(rankOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        content: `## 🏅 Almost done!\n**Game:** ${game.emoji} ${game.name}\n**Player ID:** \`${playerId}\`\n\nNow select your current rank:`,
        components: [row],
        ephemeral: true,
    });
});

// ─── Step 3 Handler: Rank selected → Create profile ──────────
selectHandler.register('start_rank_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const gameKey = parts[2];
    const playerId = parts[3].replace(/_/g, ' ');
    const originalUserId = parts[4];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ This is not your onboarding flow.', ephemeral: true });
    }

    const rank = interaction.values[0];
    const game = games[gameKey];

    // Create player profile
    players.create(interaction.user.id, game.name, playerId, rank);

    const player = players.get(interaction.user.id);
    const embed = profileEmbed(player, interaction.user);

    logger.info(`Player registered: ${interaction.user.tag} → ${game.name} (${rank})`);

    await interaction.update({
        content: null,
        embeds: [
            successEmbed('Profile Created!', `Welcome to Outplayed, **${interaction.user.displayName}**! Your profile is ready.`),
            embed,
        ],
        components: [],
    });
});
