const { REST, Routes } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const stat = fs.statSync(folderPath);

    if (stat.isDirectory()) {
        const commandFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(folderPath, file);
            const command = require(filePath);
            if ('data' in command) {
                commands.push(command.data.toJSON());
                logger.info(`Registered: /${command.data.name}`);
            }
        }
    }
}

const rest = new REST({ version: '10' }).setToken(config.discordToken);

(async () => {
    try {
        logger.info(`Deploying ${commands.length} slash commands...`);

        if (config.guildId) {
            // Guild-specific (instant, for development)
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands },
            );
            logger.success(`Deployed ${commands.length} commands to guild ${config.guildId}`);
        } else {
            // Global (takes ~1 hour to propagate)
            await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands },
            );
            logger.success(`Deployed ${commands.length} commands globally`);
        }
    } catch (error) {
        logger.error('Failed to deploy commands:', error);
    }
})();
