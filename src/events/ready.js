const { getDb } = require('../database/db');
const logger = require('../utils/logger');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        // Initialize database on startup
        getDb();
        logger.info(`✅ Outplayed bot is online! Logged in as ${client.user.tag}`);
        logger.info(`📡 Serving ${client.guilds.cache.size} guild(s)`);

        // Set bot status
        client.user.setPresence({
            activities: [{ name: '🏆 /start to begin', type: 3 }],
            status: 'online',
        });
    },
};
