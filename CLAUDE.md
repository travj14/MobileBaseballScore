# Baseball Stat Tracker

A lightweight stat-tracking server for informal baseball games. Two people play outside; this tool tracks every plate appearance, keeps a live base state, and lets you query historical stats by batter, pitcher, matchup, or game.

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Fastify (fast, low overhead, schema-based)
- **Database**: SQLite via `better-sqlite3` (single file on disk, no server needed)
- **ORM/Query builder**: Kysely (type-safe SQL, works well with SQLite)

## Goals

- Mobile- and laptop-friendly API (consumed by a frontend later)
- No teams — individual scoring only
- Full PA log queryable by batter, pitcher, batter+pitcher combo, or game
- Live game state: who's on base, outs, current inning/half

---

## Data Model

### `players`
| column | type | notes |
|--------|------|-------|
| id | INTEGER PK | |
| name | TEXT | display name |
| created_at | TEXT | ISO 8601 |

### `games`
| column | type | notes |
|--------|------|-------|
| id | INTEGER PK | |
| label | TEXT | optional friendly name (e.g. "Memorial Day 2026") |
| created_at | TEXT | ISO 8601 |
| completed_at | TEXT | nullable; set when game is closed |

### `game_players`
Roster — who is participating in a given game.

| column | type | notes |
|--------|------|-------|
| game_id | INTEGER FK → games | |
| player_id | INTEGER FK → players | |

### `plate_appearances`
One row per PA. The source of truth for all stats.

| column | type | notes |
|--------|------|-------|
| id | INTEGER PK | |
| game_id | INTEGER FK → games | |
| batter_id | INTEGER FK → players | |
| pitcher_id | INTEGER FK → players | |
| inning | INTEGER | 1-based |
| inning_half | TEXT | `"top"` or `"bottom"` |
| outcome | TEXT | see outcome types below |
| created_at | TEXT | ISO 8601 |

### `runs_scored`
Created whenever a player crosses home plate (one row per run).

| column | type | notes |
|--------|------|-------|
| id | INTEGER PK | |
| game_id | INTEGER FK → games | |
| scorer_id | INTEGER FK → players | player who scored |
| driven_in_by_pa_id | INTEGER FK → plate_appearances | PA that caused the run |

### `game_state`
One row per game. Mutable — updated after every PA.

| column | type | notes |
|--------|------|-------|
| game_id | INTEGER PK FK → games | |
| outs | INTEGER | 0–2 |
| first_base | INTEGER | player_id or NULL |
| second_base | INTEGER | player_id or NULL |
| third_base | INTEGER | player_id or NULL |
| current_inning | INTEGER | |
| current_half | TEXT | `"top"` or `"bottom"` |

---

## Outcome Types

| code | label | effect |
|------|-------|--------|
| `K` | Strikeout | out, no advancement |
| `GO` | Ground Out | out, no advancement |
| `PO` | Pop Out | out, no advancement |
| `BB` | Walk | batter to 1st, force-advance only |
| `HBP` | Hit By Pitch | batter to 1st, force-advance only |
| `1B` | Single | batter to 1st, all runners advance 1 base |
| `2B` | Double | batter to 2nd, all runners advance 2 bases |
| `3B` | Triple | batter to 3rd, all runners advance 3 bases |
| `HR` | Home Run | batter and all runners score |

---

## Base-State Logic

All base-state mutation lives in a single `applyOutcome(state, outcome, batterId)` function. Rules:

**Outs (K, GO, PO)**
- Increment `outs` by 1
- No runners move
- If `outs` reaches 3: clear all bases, reset `outs` to 0, advance `inning_half` (or inning if bottom just ended)

**BB / HBP (force-advance only)**
- If 1st is occupied → push that runner to 2nd (recursively check for force)
- If 1st and 2nd occupied → push 2nd to 3rd, 1st to 2nd
- If bases loaded → 3rd runner scores, 2nd to 3rd, 1st to 2nd
- Batter takes 1st
- A runner on 2nd or 3rd with 1st empty is never forced; they stay

**Hits (1B / 2B / 3B)**
- Every runner on base advances exactly N bases (where N = 1, 2, or 3)
- Any runner whose resulting base > 3rd scores a run
- Batter is placed at base N

**HR**
- Batter and all runners score; bases cleared

**Runs**
- Any time a player would occupy a base > 3rd (i.e. home), insert a `runs_scored` row instead

---

## API Routes

All routes are prefixed `/api/v1`. Responses are JSON.

### Players
```
POST   /players              create player
GET    /players              list all players
```

### Games
```
POST   /games                create game { label? }
GET    /games                list all games
GET    /games/:id            game detail + current state
POST   /games/:id/players    add player to game { playerId }
POST   /games/:id/complete   mark game done
```

### Plate Appearances
```
POST   /games/:id/pa         record a PA
GET    /games/:id/pa         list all PAs for a game
```

`POST /games/:id/pa` body:
```json
{
  "batterId": 1,
  "pitcherId": 2,
  "inning": 1,
  "inningHalf": "top",
  "outcome": "2B"
}
```

Response includes the updated `game_state`.

### Stats / Query
```
GET /stats/batter/:id                 career stats for a batter
GET /stats/pitcher/:id                career stats for a pitcher
GET /stats/matchup?batter=1&pitcher=2 batter vs pitcher history
GET /stats/game/:id                   per-player stat lines for a game
```

Stat lines include: PA, H, 1B, 2B, 3B, HR, BB, HBP, K, GO, PO, R (runs scored), AVG (H / (PA - BB - HBP)).

---

## Project Structure

```
/
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── .env.example          # DATABASE_PATH, PORT
├── src/
│   ├── index.ts          # server bootstrap
│   ├── db/
│   │   ├── client.ts     # better-sqlite3 + Kysely setup
│   │   ├── migrate.ts    # run migrations on startup
│   │   └── migrations/   # numbered SQL files
│   ├── routes/
│   │   ├── players.ts
│   │   ├── games.ts
│   │   ├── pa.ts
│   │   └── stats.ts
│   ├── logic/
│   │   └── baseState.ts  # applyOutcome — pure function, no DB calls
│   └── types.ts          # shared TypeScript types / enums
└── data/
    └── baseball.db       # gitignored SQLite file
```

---

## Key Behaviors & Constraints

- A player can be both batter and pitcher in different PAs within the same game, but not in the same PA.
- Inning and inning half are set explicitly per PA (not auto-incremented) so the user controls pacing.
- The `game_state` table is updated atomically with each PA insert (single SQLite transaction).
- If a PA is recorded with a different `inning`/`inningHalf` than the current state, the base state is reset to empty and outs reset to 0 before applying the new PA — the inning change is treated as a new half-inning.
- No deletion of PAs; stats are append-only.
- `better-sqlite3` is synchronous; no async DB calls needed.
