const { Client, Collection, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
    ],
});

// Command collection
client.commands = new Collection();

// --- Load Commands ---
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
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                logger.info(`Loaded command: /${command.data.name}`);
            } else {
                logger.warn(`Skipping ${filePath} — missing "data" or "execute"`);
            }
        }
    }
}

// --- Load Events ---
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
    logger.info(`Loaded event: ${event.name}`);
}

// --- Login ---
if (!config.discordToken) {
    logger.error('No DISCORD_TOKEN found! Please fill in your .env file.');
    process.exit(1);
}

client.login(config.discordToken).catch(err => {
    logger.error('Failed to login:', err.message);
    process.exit(1);
});
