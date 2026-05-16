CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS game_players (
  game_id INTEGER NOT NULL REFERENCES games(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  PRIMARY KEY (game_id, player_id)
);

CREATE TABLE IF NOT EXISTS plate_appearances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  batter_id INTEGER NOT NULL REFERENCES players(id),
  pitcher_id INTEGER NOT NULL REFERENCES players(id),
  inning INTEGER NOT NULL CHECK (inning >= 1),
  inning_half TEXT NOT NULL CHECK (inning_half IN ('top', 'bottom')),
  outcome TEXT NOT NULL CHECK (outcome IN ('K', 'GO', 'PO', 'BB', 'HBP', '1B', '2B', '3B', 'HR')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs_scored (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id),
  scorer_id INTEGER NOT NULL REFERENCES players(id),
  driven_in_by_pa_id INTEGER NOT NULL REFERENCES plate_appearances(id)
);

CREATE TABLE IF NOT EXISTS game_state (
  game_id INTEGER PRIMARY KEY REFERENCES games(id),
  outs INTEGER NOT NULL DEFAULT 0,
  first_base INTEGER REFERENCES players(id),
  second_base INTEGER REFERENCES players(id),
  third_base INTEGER REFERENCES players(id),
  current_inning INTEGER NOT NULL DEFAULT 1,
  current_half TEXT NOT NULL DEFAULT 'top'
);
