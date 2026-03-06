const logger = require('../utils/logger');

/**
 * Modal submit interaction router.
 */
async function execute(interaction) {
    const customId = interaction.customId;
    logger.debug(`Modal submitted: ${customId} by ${interaction.user.tag}`);

    // --- Registration Modal ---
    if (customId === 'start_register_modal') {
        const { handleRegisterModal } = require('../commands/auth/start');
        return handleRegisterModal(interaction);
    }

    // --- Profile Edit Modal ---
    if (customId.startsWith('profile_edit_modal_')) {
        const { handleProfileEditModal } = require('../commands/profile/profile');
        return handleProfileEditModal(interaction);
    }

    // --- Game Profile Add Modal ---
    if (customId.startsWith('game_add_modal_')) {
        const { handleGameAddModal } = require('../commands/games/games');
        return handleGameAddModal(interaction);
    }

    // --- Match Result Modal ---
    if (customId.startsWith('result_modal_')) {
        const { handleResultModal } = require('../commands/match/result');
        return handleResultModal(interaction);
    }

    logger.warn(`Unhandled modal: ${customId}`);
}

module.exports = { execute };
