-- ===========================
-- Outplayed Tournament OS
-- Database Schema
-- ===========================

CREATE TABLE IF NOT EXISTS players (
  discord_id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  player_id TEXT NOT NULL,
  rank TEXT NOT NULL,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  captain_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  current_size INTEGER DEFAULT 1,
  channel_id TEXT,
  voice_channel_id TEXT,
  category_id TEXT,
  role_id TEXT,
  tournament_id INTEGER,
  locked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (captain_id) REFERENCES players(discord_id)
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, player_id),
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (player_id) REFERENCES players(discord_id)
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_code TEXT UNIQUE NOT NULL,
  guild_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  game TEXT NOT NULL,
  team_size INTEGER NOT NULL,
  rank_restriction TEXT,
  max_teams INTEGER NOT NULL,
  format TEXT NOT NULL DEFAULT 'knockout',
  start_time TEXT NOT NULL,
  checkin_window INTEGER DEFAULT 15,
  entry_fee TEXT,
  prize_pool TEXT,
  status TEXT DEFAULT 'registration',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournament_registrations (
  tournament_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  registered_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (tournament_id, team_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  team1_id INTEGER,
  team2_id INTEGER,
  winner_id INTEGER,
  channel_id TEXT,
  status TEXT DEFAULT 'pending',
  scheduled_at TEXT,
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
  FOREIGN KEY (team1_id) REFERENCES teams(id),
  FOREIGN KEY (team2_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS checkins (
  match_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  checked_in_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (match_id, team_id),
  FOREIGN KEY (match_id) REFERENCES matches(id),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS matchmaking_queue (
  player_id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  rank TEXT NOT NULL,
  rank_bucket TEXT NOT NULL,
  queued_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (player_id) REFERENCES players(discord_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);
