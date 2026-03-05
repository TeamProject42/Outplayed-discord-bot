const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { token, clientId } = require('./config');

const commands = [];
const commandFolders = fs.readdirSync(path.join(__dirname, 'commands'));

for (const folder of commandFolders) {
    const folderPath = path.join(__dirname, 'commands', folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(folderPath, file));
        if ('data' in command) {
            commands.push(command.data.toJSON());
        }
    }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`🔄 Registering ${commands.length} slash commands...`);

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`✅ Successfully registered ${commands.length} commands!`);
    } catch (error) {
        console.error('❌ Failed to register commands:', error);
    }
})();
// All deployment complete 
