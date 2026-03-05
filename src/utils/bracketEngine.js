const { matches, franchises } = require('../database/supabase');

/**
 * Generates a single-elimination bracket from an array of registered teams (Franchise UUIDs).
 */
async function generateBracket(tournamentUuid, franchiseUuids) {
    const size = nextPowerOf2(franchiseUuids.length);
    const paddedTeams = [...franchiseUuids];
    while (paddedTeams.length < size) {
        paddedTeams.push(null); // bye slot
    }

    const seeded = seedBracket(paddedTeams);
    const matchesCreated = [];
    const totalRounds = Math.log2(size);

    for (let i = 0; i < seeded.length; i += 2) {
        const matchNumber = Math.floor(i / 2) + 1;
        const team1Id = seeded[i];
        const team2Id = seeded[i + 1];

        // If one team is a bye (null), auto-advance the other
        const isBye = !team1Id || !team2Id;
        const winnerId = isBye ? (team1Id || team2Id) : null;

        const result = await matches.create({
            Tournament_ID: tournamentUuid,
            Round: 1,
            Match_Number: matchNumber,
            Team_1_ID: team1Id,
            Team_2_ID: team2Id,
            Status: isBye ? 'Completed' : 'Pending',
            Winner_ID: winnerId
        });

        matchesCreated.push({
            id: result.Match_ID,
            round: 1,
            matchNumber,
            team1Id,
            team2Id,
            isBye,
        });
    }

    // Pre-create placeholder matches for subsequent rounds
    for (let round = 2; round <= totalRounds; round++) {
        const matchesInRound = size / Math.pow(2, round);
        for (let m = 1; m <= matchesInRound; m++) {
            await matches.create({
                Tournament_ID: tournamentUuid,
                Round: round,
                Match_Number: m,
                Team_1_ID: null,
                Team_2_ID: null,
                Status: 'Pending',
                Winner_ID: null
            });
        }
    }

    return { matchesCreated, totalRounds, bracketSize: size };
}

// ─── Helpers ──────────────────────────────────────────────────

function nextPowerOf2(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

function seedBracket(teams) {
    const n = teams.length;
    if (n <= 1) return teams;
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

module.exports = { generateBracket };
