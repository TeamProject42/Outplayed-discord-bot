const { errorEmbed } = require('../utils/embeds');
const { MessageFlags } = require('discord.js');
const { isRateLimited } = require('../middleware/rateLimiter');
const { handleCommandError } = require('../utils/errorHandler');
const { ERRORS, TITLES } = require('../utils/constants');
const logger = require('../utils/logger');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        // Rate limit check for all interactions
        if (isRateLimited(interaction.user.id)) {
            if (interaction.isRepliable()) {
                return interaction.reply({
                    embeds: [errorEmbed('Slow Down!', ERRORS.RATE_LIMIT)],
                    flags: [MessageFlags.Ephemeral],
                });
            }
            return;
        }

        // --- Slash Commands ---
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) {
                logger.warn(`Unknown command: ${interaction.commandName}`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                await handleCommandError(interaction, error);
            }
            return;
        }

        // --- Autocomplete ---
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (command && command.autocomplete) {
                try {
                    await command.autocomplete(interaction);
                } catch (error) {
                    logger.error(`Autocomplete error in /${interaction.commandName}:`, error);
                }
            }
            return;
        }

        // --- Buttons ---
        if (interaction.isButton()) {
            try {
                const buttonHandler = require('../interactions/buttons');
                await buttonHandler.execute(interaction);
            } catch (error) {
                await handleCommandError(interaction, error);
            }
            return;
        }

        // --- Select Menus ---
        if (interaction.isStringSelectMenu()) {
            try {
                const menuHandler = require('../interactions/selectMenus');
                await menuHandler.execute(interaction);
            } catch (error) {
                await handleCommandError(interaction, error);
            }
            return;
        }

        // --- Modals ---
        if (interaction.isModalSubmit()) {
            try {
                const modalHandler = require('../interactions/modals');
                await modalHandler.execute(interaction);
            } catch (error) {
                await handleCommandError(interaction, error);
            }
            return;
        }
    },
};
