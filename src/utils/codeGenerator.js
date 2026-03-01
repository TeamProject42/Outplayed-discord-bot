const { nanoid } = require('nanoid');

/**
 * Generates a 6-character uppercase alphanumeric team code.
 */
function generateTeamCode() {
    return nanoid(6).toUpperCase();
}

/**
 * Generates a tournament ID in the format OUT-XXXXX.
 */
function generateTournamentId() {
    return `OUT-${nanoid(5).toUpperCase()}`;
}

module.exports = { generateTeamCode, generateTournamentId };
