const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');

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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: '10' }).setToken(config.discordToken);

client.once('ready', async () => {
    logger.info(`Deploying ${commands.length} slash commands...`);
    const guilds = client.guilds.cache.map(guild => guild.id);

    try {
        // ALWAYS push to Global to ensure fallback
        await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
        logger.success('Deployed globally');

        // Force Sync across all active Guilds immediately (bypasses 1-hour global wait)
        for (const guildId of guilds) {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(config.clientId, guildId),
                    { body: commands },
                );
                logger.success(`Deployed ${commands.length} commands to guild ${guildId}`);
            } catch (err) {
                logger.error(`Error deploying to guild ${guildId}:`, err);
            }
        }
    } catch (e) {
        logger.error('Failed to deploy globally:', e);
    }
    
    // Shut down the temporary deployment client
    client.destroy();
    process.exit(0);
});

client.login(config.discordToken);
