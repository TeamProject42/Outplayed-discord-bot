const { errorEmbed } = require('../utils/embeds');
const logger = require('../utils/logger');

// Button handler registry — maps customId prefixes to handler functions
const handlers = {};

function register(prefix, handler) {
    handlers[prefix] = handler;
}

async function handle(interaction) {
    const customId = interaction.customId;

    // Find matching handler by prefix
    for (const [prefix, handler] of Object.entries(handlers)) {
        if (customId.startsWith(prefix)) {
            try {
                await handler(interaction);
            } catch (err) {
                console.error(`[BUTTON ERROR] ${prefix}:`, err.message, err.stack);
                logger.error(`Button handler error [${prefix}]: ${err.message}`, err);
                const reply = { embeds: [errorEmbed('Error', 'Something went wrong.')], ephemeral: true };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply).catch(() => { });
                } else {
                    await interaction.reply(reply).catch(() => { });
                }
            }
            return;
        }
    }

    // No handler found
    logger.info(`Unhandled button: ${customId}`);
}

module.exports = { handle, register };
