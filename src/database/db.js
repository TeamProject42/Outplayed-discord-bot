const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'outplayed.db');

let db;

function getDb() {
    if (!db) {
        // Ensure data directory exists
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');

        // Run schema
        const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
        db.exec(schema);

        // Safe column migrations for existing databases
        try { db.exec('ALTER TABLE teams ADD COLUMN voice_channel_id TEXT'); } catch (e) { /* column exists */ }
        try { db.exec('ALTER TABLE teams ADD COLUMN category_id TEXT'); } catch (e) { /* column exists */ }

        console.log('✅ Database initialized');
    }
    return db;
}

// ─── Player Queries ───────────────────────────────────────────
const players = {
    create(discordId, game, playerId, rank) {
        const stmt = getDb().prepare(
            'INSERT OR REPLACE INTO players (discord_id, game, player_id, rank) VALUES (?, ?, ?, ?)'
        );
        return stmt.run(discordId, game, playerId, rank);
    },

    get(discordId) {
        return getDb().prepare('SELECT * FROM players WHERE discord_id = ?').get(discordId);
    },

    update(discordId, fields) {
        const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
        const values = Object.values(fields);
        return getDb().prepare(`UPDATE players SET ${sets} WHERE discord_id = ?`).run(...values, discordId);
    },

    addWin(discordId) {
        return getDb().prepare('UPDATE players SET wins = wins + 1 WHERE discord_id = ?').run(discordId);
    },

    addLoss(discordId) {
        return getDb().prepare('UPDATE players SET losses = losses + 1 WHERE discord_id = ?').run(discordId);
    },
};

// ─── Team Queries ─────────────────────────────────────────────
const teams = {
    create(code, name, captainId, size) {
        const stmt = getDb().prepare(
            'INSERT INTO teams (code, name, captain_id, size) VALUES (?, ?, ?, ?)'
        );
        return stmt.run(code, name, captainId, size);
    },

    getByCode(code) {
        return getDb().prepare('SELECT * FROM teams WHERE code = ?').get(code);
    },

    getById(id) {
        return getDb().prepare('SELECT * FROM teams WHERE id = ?').get(id);
    },

    getByPlayer(playerId) {
        return getDb().prepare(
            `SELECT t.* FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.player_id = ?`
        ).all(playerId);
    },

    updateChannel(teamId, channelId, voiceChannelId, categoryId) {
        return getDb().prepare(
            'UPDATE teams SET channel_id = ?, voice_channel_id = ?, category_id = ? WHERE id = ?'
        ).run(channelId, voiceChannelId || null, categoryId || null, teamId);
    },

    incrementSize(teamId) {
        return getDb().prepare(
            'UPDATE teams SET current_size = current_size + 1 WHERE id = ?'
        ).run(teamId);
    },

    lock(teamId) {
        return getDb().prepare('UPDATE teams SET locked = 1 WHERE id = ?').run(teamId);
    },

    unlock(teamId) {
        return getDb().prepare('UPDATE teams SET locked = 0 WHERE id = ?').run(teamId);
    },

    transferCaptain(teamId, newCaptainId) {
        return getDb().prepare('UPDATE teams SET captain_id = ? WHERE id = ?').run(newCaptainId, teamId);
    },

    decrementSize(teamId) {
        return getDb().prepare('UPDATE teams SET current_size = CASE WHEN current_size > 0 THEN current_size - 1 ELSE 0 END WHERE id = ?').run(teamId);
    },

    setTournament(teamId, tournamentId) {
        return getDb().prepare('UPDATE teams SET tournament_id = ? WHERE id = ?').run(tournamentId, teamId);
    },

    delete(teamId) {
        // Clean up all foreign key dependencies
        getDb().prepare('DELETE FROM tournament_registrations WHERE team_id = ?').run(teamId);
        getDb().prepare('DELETE FROM team_members WHERE team_id = ?').run(teamId);
        // Clean up match references (checkins first, then matches)
        const matchIds = getDb().prepare('SELECT id FROM matches WHERE team1_id = ? OR team2_id = ?').all(teamId, teamId).map(m => m.id);
        for (const mid of matchIds) {
            getDb().prepare('DELETE FROM checkins WHERE match_id = ?').run(mid);
        }
        getDb().prepare('DELETE FROM matches WHERE team1_id = ? OR team2_id = ?').run(teamId, teamId);
        return getDb().prepare('DELETE FROM teams WHERE id = ?').run(teamId);
    },

    getMembers(teamId) {
        return getDb().prepare(
            'SELECT p.* FROM players p JOIN team_members tm ON p.discord_id = tm.player_id WHERE tm.team_id = ?'
        ).all(teamId);
    },

    addMember(teamId, playerId) {
        return getDb().prepare(
            'INSERT INTO team_members (team_id, player_id) VALUES (?, ?)'
        ).run(teamId, playerId);
    },

    removeMember(teamId, playerId) {
        return getDb().prepare(
            'DELETE FROM team_members WHERE team_id = ? AND player_id = ?'
        ).run(teamId, playerId);
    },
};

// ─── Tournament Queries ───────────────────────────────────────
const tournaments = {
    create(data) {
        const stmt = getDb().prepare(
            `INSERT INTO tournaments (tournament_code, guild_id, owner_id, name, game, team_size, rank_restriction, max_teams, format, start_time, checkin_window, entry_fee, prize_pool)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        return stmt.run(
            data.tournamentCode, data.guildId, data.ownerId, data.name, data.game,
            data.teamSize, data.rankRestriction, data.maxTeams, data.format,
            data.startTime, data.checkinWindow, data.entryFee, data.prizePool
        );
    },

    getById(id) {
        return getDb().prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
    },

    getByCode(code) {
        return getDb().prepare('SELECT * FROM tournaments WHERE tournament_code = ?').get(code);
    },

    getByGuild(guildId) {
        return getDb().prepare('SELECT * FROM tournaments WHERE guild_id = ? ORDER BY created_at DESC').all(guildId);
    },

    getActive(guildId) {
        return getDb().prepare(
            "SELECT * FROM tournaments WHERE guild_id = ? AND status IN ('registration', 'registration_closed', 'active') ORDER BY created_at DESC"
        ).all(guildId);
    },

    updateStatus(id, status) {
        return getDb().prepare('UPDATE tournaments SET status = ? WHERE id = ?').run(status, id);
    },

    update(id, fields) {
        const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
        const values = Object.values(fields);
        return getDb().prepare(`UPDATE tournaments SET ${sets} WHERE id = ?`).run(...values, id);
    },

    getRegisteredTeams(tournamentId) {
        return getDb().prepare(
            `SELECT t.* FROM teams t
       JOIN tournament_registrations tr ON t.id = tr.team_id
       WHERE tr.tournament_id = ?`
        ).all(tournamentId);
    },

    registerTeam(tournamentId, teamId) {
        return getDb().prepare(
            'INSERT INTO tournament_registrations (tournament_id, team_id) VALUES (?, ?)'
        ).run(tournamentId, teamId);
    },

    unregisterTeam(tournamentId, teamId) {
        return getDb().prepare(
            'DELETE FROM tournament_registrations WHERE tournament_id = ? AND team_id = ?'
        ).run(tournamentId, teamId);
    },

    isTeamRegistered(tournamentId, teamId) {
        return getDb().prepare(
            'SELECT 1 FROM tournament_registrations WHERE tournament_id = ? AND team_id = ?'
        ).get(tournamentId, teamId);
    },

    getRegistrationCount(tournamentId) {
        const row = getDb().prepare(
            'SELECT COUNT(*) as count FROM tournament_registrations WHERE tournament_id = ?'
        ).get(tournamentId);
        return row.count;
    },
};

// ─── Match Queries ────────────────────────────────────────────
const matches = {
    create(tournamentId, round, matchNumber, team1Id, team2Id) {
        return getDb().prepare(
            'INSERT INTO matches (tournament_id, round, match_number, team1_id, team2_id) VALUES (?, ?, ?, ?, ?)'
        ).run(tournamentId, round, matchNumber, team1Id, team2Id);
    },

    getById(id) {
        return getDb().prepare('SELECT * FROM matches WHERE id = ?').get(id);
    },

    getByTournament(tournamentId) {
        return getDb().prepare(
            'SELECT * FROM matches WHERE tournament_id = ? ORDER BY round, match_number'
        ).all(tournamentId);
    },

    getByRound(tournamentId, round) {
        return getDb().prepare(
            'SELECT * FROM matches WHERE tournament_id = ? AND round = ? ORDER BY match_number'
        ).all(tournamentId, round);
    },

    getPending(tournamentId) {
        return getDb().prepare(
            "SELECT * FROM matches WHERE tournament_id = ? AND status = 'pending' ORDER BY round, match_number"
        ).all(tournamentId);
    },

    setWinner(matchId, winnerId) {
        return getDb().prepare(
            "UPDATE matches SET winner_id = ?, status = 'completed' WHERE id = ?"
        ).run(winnerId, matchId);
    },

    setChannel(matchId, channelId) {
        return getDb().prepare(
            'UPDATE matches SET channel_id = ? WHERE id = ?'
        ).run(channelId, matchId);
    },

    updateStatus(matchId, status) {
        return getDb().prepare(
            'UPDATE matches SET status = ? WHERE id = ?'
        ).run(status, matchId);
    },
};

// ─── Check-in Queries ─────────────────────────────────────────
const checkins = {
    create(matchId, teamId) {
        return getDb().prepare(
            'INSERT OR IGNORE INTO checkins (match_id, team_id) VALUES (?, ?)'
        ).run(matchId, teamId);
    },

    getForMatch(matchId) {
        return getDb().prepare('SELECT * FROM checkins WHERE match_id = ?').all(matchId);
    },

    hasCheckedIn(matchId, teamId) {
        return getDb().prepare(
            'SELECT 1 FROM checkins WHERE match_id = ? AND team_id = ?'
        ).get(matchId, teamId);
    },
};

// ─── Matchmaking Queue ───────────────────────────────────────
const queue = {
    add(playerId, game, rank, rankBucket) {
        return getDb().prepare(
            'INSERT OR REPLACE INTO matchmaking_queue (player_id, game, rank, rank_bucket) VALUES (?, ?, ?, ?)'
        ).run(playerId, game, rank, rankBucket);
    },

    remove(playerId) {
        return getDb().prepare('DELETE FROM matchmaking_queue WHERE player_id = ?').run(playerId);
    },

    getByBucket(game, rankBucket) {
        return getDb().prepare(
            'SELECT * FROM matchmaking_queue WHERE game = ? AND rank_bucket = ? ORDER BY queued_at'
        ).all(game, rankBucket);
    },

    isQueued(playerId) {
        return getDb().prepare('SELECT 1 FROM matchmaking_queue WHERE player_id = ?').get(playerId);
    },
};

// ─── Audit Log ────────────────────────────────────────────────
const auditLog = {
    log(guildId, actorId, action, target = null, details = null) {
        return getDb().prepare(
            'INSERT INTO audit_log (guild_id, actor_id, action, target, details) VALUES (?, ?, ?, ?, ?)'
        ).run(guildId, actorId, action, target, typeof details === 'object' ? JSON.stringify(details) : details);
    },

    getByGuild(guildId, limit = 50) {
        return getDb().prepare(
            'SELECT * FROM audit_log WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?'
        ).all(guildId, limit);
    },
};

module.exports = { getDb, players, teams, tournaments, matches, checkins, queue, auditLog };
