const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: '10' }).setToken(config.discordToken);

client.once('ready', async () => {
    logger.info(`Logged in as ${client.user.tag}`);
    const guilds = client.guilds.cache.map(guild => guild.id);
    
    for (const id of guilds) {
        try {
            await rest.put(Routes.applicationGuildCommands(config.clientId, id), { body: [] });
            logger.success(`Cleared commands for guild ${id}`);
        } catch (e) {
            logger.error(`Failed to clear for ${id}:`, e);
        }
    }
    
    client.destroy();
});

client.login(config.discordToken);
