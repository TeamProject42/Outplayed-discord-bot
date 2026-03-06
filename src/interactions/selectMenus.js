const logger = require('../utils/logger');

/**
 * Select menu interaction router.
 */
async function execute(interaction) {
    const customId = interaction.customId;
    logger.debug(`Select menu: ${customId} by ${interaction.user.tag}`);

    // --- Game Selection for /start ---
    if (customId === 'start_game_select') {
        const { handleGameSelect } = require('../commands/games/games');
        return handleGameSelect(interaction);
    }

    // --- Region Selection ---
    if (customId === 'profile_region_select') {
        const { handleRegionSelect } = require('../commands/profile/profile');
        return handleRegionSelect(interaction);
    }

    // --- Rank Selection ---
    if (customId.startsWith('rank_select_')) {
        const { handleRankSelect } = require('../commands/games/games');
        return handleRankSelect(interaction);
    }

    logger.warn(`Unhandled select menu: ${customId}`);
}

module.exports = { execute };
