#!/usr/bin/env node
/**
 * Outplayed DB Admin Tool
 * Usage:
 *   node db-admin.js                    → Show all tables summary
 *   node db-admin.js players            → List all players
 *   node db-admin.js teams              → List all teams + members
 *   node db-admin.js tournaments        → List all tournaments
 *   node db-admin.js matches            → List all matches
 *   node db-admin.js query "SQL HERE"   → Run raw SQL
 *   node db-admin.js clear players      → Delete all players
 *   node db-admin.js clear teams        → Delete all teams + members
 *   node db-admin.js clear tournaments  → Delete all tournaments + registrations
 *   node db-admin.js clear all          → Wipe entire database
 *   node db-admin.js delete-player <discord_id>  → Remove a specific player
 *   node db-admin.js delete-team <team_id>       → Remove a specific team
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'outplayed.db');

if (!fs.existsSync(DB_PATH)) {
    console.log('❌ Database not found at', DB_PATH);
    console.log('   Start the bot first to create the database.');
    process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const command = process.argv[2] || 'summary';
const arg = process.argv[3] || null;

function printTable(rows, title) {
    console.log(`\n━━━ ${title} ━━━`);
    if (rows.length === 0) {
        console.log('  (empty)');
        return;
    }
    console.table(rows);
    console.log(`  Total: ${rows.length}`);
}

switch (command) {
    case 'summary': {
        console.log('\n🗄️  Outplayed Database Summary\n');
        const tables = ['players', 'teams', 'team_members', 'tournaments', 'tournament_registrations', 'matches', 'checkins', 'matchmaking_queue', 'audit_log'];
        for (const table of tables) {
            try {
                const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
                console.log(`  📋 ${table.padEnd(25)} ${count} rows`);
            } catch (_) {
                console.log(`  ⚠️  ${table.padEnd(25)} (not found)`);
            }
        }
        break;
    }

    case 'players': {
        const rows = db.prepare('SELECT discord_id, player_id, game, rank, wins, losses, created_at FROM players').all();
        printTable(rows, 'Players');
        break;
    }

    case 'teams': {
        const teams = db.prepare('SELECT id, code, name, captain_id, size, current_size, locked, tournament_id FROM teams').all();
        printTable(teams, 'Teams');
        for (const team of teams) {
            const members = db.prepare('SELECT player_id FROM team_members WHERE team_id = ?').all(team.id);
            if (members.length > 0) {
                console.log(`  └─ Team ${team.id} members: ${members.map(m => m.player_id).join(', ')}`);
            }
        }
        break;
    }

    case 'tournaments': {
        const rows = db.prepare('SELECT id, tournament_code, name, game, status, team_size, max_teams, format FROM tournaments').all();
        printTable(rows, 'Tournaments');
        for (const t of rows) {
            const regCount = db.prepare('SELECT COUNT(*) as c FROM tournament_registrations WHERE tournament_id = ?').get(t.id).c;
            console.log(`  └─ ${t.tournament_code}: ${regCount} teams registered`);
        }
        break;
    }

    case 'matches': {
        const rows = db.prepare('SELECT id, tournament_id, round, match_number, team1_id, team2_id, winner_id, status FROM matches').all();
        printTable(rows, 'Matches');
        break;
    }

    case 'queue': {
        const rows = db.prepare('SELECT * FROM matchmaking_queue').all();
        printTable(rows, 'Matchmaking Queue');
        break;
    }

    case 'audit': {
        const rows = db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20').all();
        printTable(rows, 'Audit Log (last 20)');
        break;
    }

    case 'query': {
        if (!arg) {
            console.log('Usage: node db-admin.js query "SELECT * FROM players"');
            break;
        }
        try {
            if (arg.trim().toUpperCase().startsWith('SELECT')) {
                const rows = db.prepare(arg).all();
                console.table(rows);
                console.log(`${rows.length} rows returned`);
            } else {
                const result = db.prepare(arg).run();
                console.log('✅ Executed:', result);
            }
        } catch (err) {
            console.log('❌ Error:', err.message);
        }
        break;
    }

    case 'clear': {
        if (!arg) {
            console.log('Usage: node db-admin.js clear [players|teams|tournaments|all]');
            break;
        }
        if (arg === 'players') {
            db.prepare('DELETE FROM team_members').run();
            db.prepare('DELETE FROM players').run();
            console.log('✅ All players and team memberships cleared');
        } else if (arg === 'teams') {
            db.prepare('DELETE FROM team_members').run();
            db.prepare('DELETE FROM tournament_registrations').run();
            db.prepare('DELETE FROM teams').run();
            console.log('✅ All teams, members, and registrations cleared');
        } else if (arg === 'tournaments') {
            db.prepare('DELETE FROM checkins').run();
            db.prepare('DELETE FROM matches').run();
            db.prepare('DELETE FROM tournament_registrations').run();
            db.prepare('DELETE FROM tournaments').run();
            console.log('✅ All tournaments, matches, and registrations cleared');
        } else if (arg === 'all') {
            db.prepare('DELETE FROM checkins').run();
            db.prepare('DELETE FROM matches').run();
            db.prepare('DELETE FROM matchmaking_queue').run();
            db.prepare('DELETE FROM tournament_registrations').run();
            db.prepare('DELETE FROM team_members').run();
            db.prepare('DELETE FROM audit_log').run();
            db.prepare('DELETE FROM teams').run();
            db.prepare('DELETE FROM tournaments').run();
            db.prepare('DELETE FROM players').run();
            console.log('✅ Entire database wiped clean');
        }
        break;
    }

    case 'delete-player': {
        if (!arg) { console.log('Usage: node db-admin.js delete-player <discord_id>'); break; }
        db.prepare('DELETE FROM team_members WHERE player_id = ?').run(arg);
        db.prepare('DELETE FROM matchmaking_queue WHERE player_id = ?').run(arg);
        db.prepare('DELETE FROM players WHERE discord_id = ?').run(arg);
        console.log(`✅ Player ${arg} deleted`);
        break;
    }

    case 'delete-team': {
        if (!arg) { console.log('Usage: node db-admin.js delete-team <team_id>'); break; }
        db.prepare('DELETE FROM team_members WHERE team_id = ?').run(parseInt(arg));
        db.prepare('DELETE FROM tournament_registrations WHERE team_id = ?').run(parseInt(arg));
        db.prepare('DELETE FROM teams WHERE id = ?').run(parseInt(arg));
        console.log(`✅ Team ${arg} deleted`);
        break;
    }

    default:
        console.log('Unknown command. Run without arguments to see database summary.');
}

db.close();
