const { checkRateLimit } = require('../middleware/rateLimiter');
const { errorEmbed } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        try {
            // ─── Slash Commands ──────────────────────────────────
            if (interaction.isChatInputCommand()) {
                // Rate limit check
                const allowed = await checkRateLimit(interaction);
                if (!allowed) return;

                const command = interaction.client.commands.get(interaction.commandName);
                if (!command) {
                    await interaction.reply({ embeds: [errorEmbed('Unknown Command', 'This command does not exist.')], ephemeral: true });
                    return;
                }

                await command.execute(interaction);
                return;
            }

            // ─── Button Interactions ─────────────────────────────
            if (interaction.isButton()) {
                const buttonHandler = require('../interactions/buttons');
                await buttonHandler.handle(interaction);
                return;
            }

            // ─── Select Menu Interactions ────────────────────────
            if (interaction.isStringSelectMenu()) {
                const selectHandler = require('../interactions/selectMenus');
                await selectHandler.handle(interaction);
                return;
            }

            // ─── Modal Submissions ──────────────────────────────
            if (interaction.isModalSubmit()) {
                const modalHandler = require('../interactions/modals');
                await modalHandler.handle(interaction);
                return;
            }

        } catch (err) {
            logger.error(`Interaction error: ${err.message}`, err);

            const reply = { embeds: [errorEmbed('Error', 'Something went wrong. Please try again.')], ephemeral: true };

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            } catch (_) {
                // Interaction expired, nothing we can do
            }
        }
    },
};
