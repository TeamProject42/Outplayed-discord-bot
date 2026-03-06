require('dotenv').config();

const config = {
    // Discord
    discordToken: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,

    // Supabase
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,

    // Bot branding
    botName: 'Outplayed',
    embedColor: 0x7C3AED,        // Purple
    successColor: 0x22C55E,      // Green
    errorColor: 0xEF4444,        // Red
    warningColor: 0xF59E0B,      // Amber
    infoColor: 0x3B82F6,         // Blue
};

// Validate required env vars
const required = ['discordToken', 'clientId', 'guildId', 'supabaseUrl', 'supabaseKey'];
for (const key of required) {
    if (!config[key]) {
        console.error(`❌ Missing required env var for: ${key}`);
        console.error(`   Please fill in your .env file. See .env.example for reference.`);
    }
}

module.exports = config;
