const { errorEmbed } = require('./embeds');
const { MessageFlags } = require('discord.js');
const { ERRORS, TITLES } = require('./constants');
const logger = require('./logger');

async function handleCommandError(interaction, error) {
    // Ignore errors where the interaction is already acknowledged or expired
    if (error.code === 40060 || error.code === 10062) {
        return;
    }

    logger.error(`Error executing ${interaction.commandName || 'interaction'}:`, error);

    const replyContent = {
        embeds: [errorEmbed(TITLES.ERROR, ERRORS.GENERIC_ERROR)],
        flags: [MessageFlags.Ephemeral],
    };

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply(replyContent);
        } else {
            await interaction.reply(replyContent);
        }
    } catch (err) {
        // If we still fail, it's likely expired or already replied in a way we couldn't detect
        if (err.code !== 40060 && err.code !== 10062) {
            logger.error('Failed to send error reply:', err);
        }
    }
}

module.exports = {
    handleCommandError,
};
