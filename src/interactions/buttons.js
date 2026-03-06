const logger = require('../utils/logger');

/**
 * Button interaction router.
 * Routes button clicks by customId prefix.
 */
async function execute(interaction) {
    const customId = interaction.customId;
    logger.debug(`Button clicked: ${customId} by ${interaction.user.tag}`);

    // --- Team Invite Accept/Reject ---
    if (customId.startsWith('team_accept_')) {
        const { handleTeamAccept } = require('../commands/team/team');
        return handleTeamAccept(interaction);
    }
    if (customId.startsWith('team_reject_')) {
        const { handleTeamReject } = require('../commands/team/team');
        return handleTeamReject(interaction);
    }

    // --- Match Check-in ---
    if (customId.startsWith('checkin_')) {
        const { handleCheckinButton } = require('../commands/match/checkin');
        return handleCheckinButton(interaction);
    }

    // --- Match Result Confirm ---
    if (customId.startsWith('result_confirm_')) {
        const { handleResultConfirm } = require('../commands/match/result');
        return handleResultConfirm(interaction);
    }

    if (customId.startsWith('result_deny_')) {
        const { handleResultDeny } = require('../commands/match/result');
        return handleResultDeny(interaction);
    }

    // --- Tournament Registration ---
    if (customId.startsWith('tournament_register_')) {
        const { handleTournamentRegisterButton } = require('../commands/tournament/register');
        return handleTournamentRegisterButton(interaction);
    }

    // --- Pagination ---
    if (customId.startsWith('page_')) {
        // Generic pagination — handled by the originating command
        // The customId format is: page_{commandName}_{direction}_{currentPage}
        logger.debug(`Pagination button: ${customId}`);
        return;
    }

    logger.warn(`Unhandled button: ${customId}`);
}

module.exports = { execute };
