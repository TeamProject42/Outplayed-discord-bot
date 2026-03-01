const { errorEmbed } = require('../utils/embeds');
const logger = require('../utils/logger');

const handlers = {};

function register(prefix, handler) {
    handlers[prefix] = handler;
}

async function handle(interaction) {
    const customId = interaction.customId;

    for (const [prefix, handler] of Object.entries(handlers)) {
        if (customId.startsWith(prefix)) {
            try {
                await handler(interaction);
            } catch (err) {
                logger.error(`Select menu handler error [${prefix}]: ${err.message}`, err);
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

    logger.info(`Unhandled select menu: ${customId}`);
}

module.exports = { handle, register };
