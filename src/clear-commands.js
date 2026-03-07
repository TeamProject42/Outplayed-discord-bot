const { REST, Routes } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');

const rest = new REST({ version: '10' }).setToken(config.discordToken);

(async () => {
    try {
        logger.info('Clearing all global and guild commands...');

        // Clear global commands
        try {
            await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
            logger.success('Successfully deleted all global commands.');
        } catch (e) {
            logger.error('Failed to clear global commands:', e);
        }

        // Clear guild commands
        if (config.guildId) {
            try {
                await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: [] });
                logger.success(`Successfully deleted all guild commands for ${config.guildId}.`);
            } catch (e) {
                logger.error(`Failed to clear guild commands:`, e);
            }
        }
    } catch (error) {
        logger.error('Failed to execute command clearing:', error);
    }
})();
