/**
 * Game constants — maps game names to their Supabase table names.
 * Each game has: memberTable, rosterTable, matchParticipationTable, tournamentParticipationTable
 */
const GAMES = {
    bgmi: {
        name: 'BGMI',
        dbName: 'BGMI',
        memberTable: 'BgmiMember',
        rosterTable: 'BgmiRoster',
        matchParticipationTable: 'BgmiMatchParticipation',
        tournamentParticipationTable: 'BgmiTournamentParticipation',
        matchTable: 'BgmiMatch',
        rosterUuidField: 'Roster_UUID',
        leaderField: 'Roster_Leader_UUID',
        emoji: '🔫',
        ranks: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Crown', 'Ace', 'Ace Master', 'Ace Dominator', 'Conqueror'],
        roles: ['Assaulter', 'IGL', 'Support', 'Sniper', 'Fragger'],
    },
    valorant: {
        name: 'Valorant',
        dbName: 'Valorant',
        memberTable: 'ValorantMember',
        rosterTable: 'ValoRoster',
        matchParticipationTable: 'ValoMatchParticipation',
        tournamentParticipationTable: 'ValoTournamentParticipation',
        matchTable: 'ValoMatch',
        rosterUuidField: 'Roster_UUID',
        leaderField: 'ValoRoster_Leader_UUID',
        emoji: '🎯',
        ranks: ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'],
        roles: ['Duelist', 'Controller', 'Initiator', 'Sentinel', 'Flex'],
    },
    freefire: {
        name: 'Free Fire',
        dbName: 'FreeFire',
        memberTable: 'FreeFireMember',
        rosterTable: 'FreeFireRoster',
        matchParticipationTable: 'FreeFireMatchParticipation',
        tournamentParticipationTable: 'FreeFireTournamentParticipation',
        matchTable: 'FreeFireMatch',
        rosterUuidField: 'Roster_UUID',
        leaderField: 'Roster_Leader_UUID',
        emoji: '🔥',
        ranks: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Heroic', 'Grandmaster'],
        roles: ['Rusher', 'Support', 'Sniper', 'IGL'],
    },
    codmobile: {
        name: 'COD Mobile',
        dbName: 'CODMobile',
        memberTable: 'CODMobileMember',
        rosterTable: 'CODMobileRoster',
        matchParticipationTable: null, // No specific match participation table in schema
        tournamentParticipationTable: null,
        matchTable: null,
        rosterUuidField: 'Roster_UUID',
        leaderField: 'Roster_Leader_UUID',
        emoji: '💥',
        ranks: ['Rookie', 'Veteran', 'Elite', 'Pro', 'Master', 'Grandmaster', 'Legendary'],
        roles: ['Slayer', 'OBJ', 'Anchor', 'Support', 'Flex'],
    },
    mobilelegends: {
        name: 'Mobile Legends',
        dbName: 'MobaLegends',
        memberTable: 'MobaLegendsMember',
        rosterTable: 'MobaLegendsRoster',
        matchParticipationTable: 'MobaLegMatchParticipation',
        tournamentParticipationTable: 'MobaLegTournamentParticipation',
        matchTable: 'MobaLegMatch',
        rosterUuidField: 'Roster_UUID',
        leaderField: 'MobaLeg_Leader_UUID',
        emoji: '⚔️',
        ranks: ['Warrior', 'Elite', 'Master', 'Grandmaster', 'Epic', 'Legend', 'Mythic', 'Mythical Glory', 'Immortal'],
        roles: ['Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support'],
    },
};

/**
 * Get game config by key (case-insensitive)
 */
function getGame(key) {
    return GAMES[key.toLowerCase()] || null;
}

/**
 * Get all game keys
 */
function getGameKeys() {
    return Object.keys(GAMES);
}

/**
 * Get game choices for slash command options
 */
function getGameChoices() {
    return Object.entries(GAMES).map(([key, game]) => ({
        name: `${game.emoji} ${game.name}`,
        value: key,
    }));
}

module.exports = { GAMES, getGame, getGameKeys, getGameChoices };
