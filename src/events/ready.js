const { testConnection } = require('../database/supabase');
const logger = require('../utils/logger');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        logger.success(`${client.user.tag} is online!`);
        logger.info(`Serving ${client.guilds.cache.size} guild(s)`);

        // Test Supabase connection
        await testConnection();

        // Set bot activity
        client.user.setActivity('/start to register', { type: 3 }); // WATCHING
    },
};
