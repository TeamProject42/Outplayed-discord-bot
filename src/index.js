const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { token } = require('./config');
const logger = require('./utils/logger');

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
    ],
});

// ─── Load Commands ────────────────────────────────────────────
client.commands = new Collection();

const commandFolders = fs.readdirSync(path.join(__dirname, 'commands'));
for (const folder of commandFolders) {
    const folderPath = path.join(__dirname, 'commands', folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(folderPath, file));
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            logger.info(`📦 Loaded command: /${command.data.name}`);
        }
    }
}

// ─── Load Events ──────────────────────────────────────────────
const eventFiles = fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(path.join(__dirname, 'events', file));
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
    logger.info(`⚡ Loaded event: ${event.name}`);
}

// ─── Start Web Server (tournament invite pages) ──────────────
try {
    require('./web/server');
} catch (err) {
    logger.info('🌐 Web server not loaded (optional)');
}

// ─── Login ────────────────────────────────────────────────────
client.login(token);
