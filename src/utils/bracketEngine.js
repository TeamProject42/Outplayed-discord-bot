const { matches: matchDb, teams: teamDb } = require('../database/db');

/**
 * Generates a single-elimination bracket from an array of registered teams.
 * Teams are seeded in registration order. If the count isn't a power of 2,
 * some teams get a bye (null opponent) in round 1.
 */
function generateBracket(tournamentId, teamIds) {
    // Pad to next power of 2
    const size = nextPowerOf2(teamIds.length);
    const paddedTeams = [...teamIds];
    while (paddedTeams.length < size) {
        paddedTeams.push(null); // bye slot
    }

    // Seed the bracket
    const seeded = seedBracket(paddedTeams);

    // Create round 1 matches
    const matchesCreated = [];
    for (let i = 0; i < seeded.length; i += 2) {
        const matchNumber = Math.floor(i / 2) + 1;
        const team1 = seeded[i];
        const team2 = seeded[i + 1];

        const result = matchDb.create(tournamentId, 1, matchNumber, team1, team2);

        // If one team is a bye (null), auto-advance the other
        if (!team1 || !team2) {
            const winner = team1 || team2;
            matchDb.setWinner(result.lastInsertRowid, winner);
        }

        matchesCreated.push({
            id: result.lastInsertRowid,
            round: 1,
            matchNumber,
            team1Id: team1,
            team2Id: team2,
            isBye: !team1 || !team2,
        });
    }

    // Calculate total rounds
    const totalRounds = Math.log2(size);

    // Pre-create placeholder matches for subsequent rounds
    for (let round = 2; round <= totalRounds; round++) {
        const matchesInRound = size / Math.pow(2, round);
        for (let m = 1; m <= matchesInRound; m++) {
            matchDb.create(tournamentId, round, m, null, null);
        }
    }

    return { matchesCreated, totalRounds, bracketSize: size };
}

/**
 * Advances the winner of a match to the next round.
 * Returns the next match info, or null if this was the final.
 */
function advanceWinner(tournamentId, matchId, winnerId) {
    const match = matchDb.getById(matchId);
    if (!match) return null;

    matchDb.setWinner(matchId, winnerId);

    // Determine the next match
    const nextRound = match.round + 1;
    const nextMatchNumber = Math.ceil(match.match_number / 2);

    const nextRoundMatches = matchDb.getByRound(tournamentId, nextRound);
    const nextMatch = nextRoundMatches.find(m => m.match_number === nextMatchNumber);

    if (!nextMatch) {
        // This was the final — winnerId is the champion
        return { isFinal: true, championTeamId: winnerId };
    }

    // Place winner into the correct slot
    if (match.match_number % 2 === 1) {
        // Odd match → team1 slot
        matchDb.getById(nextMatch.id); // ensure exists
        const db = require('../database/db').getDb();
        db.prepare('UPDATE matches SET team1_id = ? WHERE id = ?').run(winnerId, nextMatch.id);
    } else {
        // Even match → team2 slot
        const db = require('../database/db').getDb();
        db.prepare('UPDATE matches SET team2_id = ? WHERE id = ?').run(winnerId, nextMatch.id);
    }

    // Check if both teams are now set — if so, the match is live
    const updatedNext = matchDb.getById(nextMatch.id);
    const isReady = updatedNext.team1_id && updatedNext.team2_id;

    return {
        isFinal: false,
        nextMatchId: nextMatch.id,
        nextRound,
        nextMatchNumber,
        isReady,
    };
}

/**
 * Gets the current bracket state for display.
 */
function getBracketState(tournamentId) {
    const allMatches = matchDb.getByTournament(tournamentId);
    const rounds = {};

    for (const match of allMatches) {
        if (!rounds[match.round]) rounds[match.round] = [];

        const team1 = match.team1_id ? teamDb.getById(match.team1_id) : null;
        const team2 = match.team2_id ? teamDb.getById(match.team2_id) : null;
        const winner = match.winner_id ? teamDb.getById(match.winner_id) : null;

        rounds[match.round].push({
            matchId: match.id,
            matchNumber: match.match_number,
            team1: team1 ? team1.name : 'BYE',
            team2: team2 ? team2.name : 'TBD',
            winner: winner ? winner.name : null,
            status: match.status,
        });
    }

    return rounds;
}

// ─── Helpers ──────────────────────────────────────────────────

function nextPowerOf2(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

/**
 * Seeds teams in tournament bracket order:
 * 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6 (for 8 teams)
 */
function seedBracket(teams) {
    const n = teams.length;
    if (n <= 1) return teams;

    // Standard tournament seeding
    const order = getBracketOrder(n);
    return order.map(i => teams[i]);
}

function getBracketOrder(n) {
    if (n === 1) return [0];
    const half = getBracketOrder(n / 2);
    const result = [];
    for (const i of half) {
        result.push(i);
        result.push(n - 1 - i);
    }
    return result;
}

module.exports = { generateBracket, advanceWinner, getBracketState };
