const { errorEmbed } = require('../utils/embeds');
const { isRateLimited } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        // Rate limit check for all interactions
        if (isRateLimited(interaction.user.id)) {
            if (interaction.isRepliable()) {
                return interaction.reply({
                    embeds: [errorEmbed('Slow Down!', 'You\'re sending commands too fast. Please wait a few seconds.')],
                    ephemeral: true,
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
                logger.error(`Error executing /${interaction.commandName}:`, error);
                const reply = {
                    embeds: [errorEmbed('Command Error', 'Something went wrong while executing this command. Please try again.')],
                    ephemeral: true,
                };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
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
                logger.error('Button interaction error:', error);
                if (interaction.isRepliable() && !interaction.replied) {
                    await interaction.reply({
                        embeds: [errorEmbed('Error', 'Something went wrong with this button. Please try again.')],
                        ephemeral: true,
                    });
                }
            }
            return;
        }

        // --- Select Menus ---
        if (interaction.isStringSelectMenu()) {
            try {
                const menuHandler = require('../interactions/selectMenus');
                await menuHandler.execute(interaction);
            } catch (error) {
                logger.error('Select menu interaction error:', error);
                if (interaction.isRepliable() && !interaction.replied) {
                    await interaction.reply({
                        embeds: [errorEmbed('Error', 'Something went wrong with this selection. Please try again.')],
                        ephemeral: true,
                    });
                }
            }
            return;
        }

        // --- Modals ---
        if (interaction.isModalSubmit()) {
            try {
                const modalHandler = require('../interactions/modals');
                await modalHandler.execute(interaction);
            } catch (error) {
                logger.error('Modal interaction error:', error);
                if (interaction.isRepliable() && !interaction.replied) {
                    await interaction.reply({
                        embeds: [errorEmbed('Error', 'Something went wrong submitting this form. Please try again.')],
                        ephemeral: true,
                    });
                }
            }
            return;
        }
    },
};
