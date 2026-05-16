import type { ColumnType, Generated } from 'kysely'

export type Outcome = 'K' | 'GO' | 'PO' | 'BB' | 'HBP' | '1B' | '2B' | '3B' | 'HR'
export type Half = 'top' | 'bottom'

export const OUTCOMES: Outcome[] = ['K', 'GO', 'PO', 'BB', 'HBP', '1B', '2B', '3B', 'HR']

export interface PlayersTable {
  id: Generated<number>
  name: string
  created_at: ColumnType<string, string | undefined, never>
}

export interface GamesTable {
  id: Generated<number>
  label: string | null
  created_at: ColumnType<string, string | undefined, never>
  completed_at: string | null
}

export interface GamePlayersTable {
  game_id: number
  player_id: number
}

export interface PlateAppearancesTable {
  id: Generated<number>
  game_id: number
  batter_id: number
  pitcher_id: number
  inning: number
  inning_half: Half
  outcome: Outcome
  created_at: ColumnType<string, string | undefined, never>
}

export interface RunsScoredTable {
  id: Generated<number>
  game_id: number
  scorer_id: number
  driven_in_by_pa_id: number
}

export interface GameStateTable {
  game_id: number
  outs: number
  first_base: number | null
  second_base: number | null
  third_base: number | null
  current_inning: number
  current_half: Half
}

export interface DB {
  players: PlayersTable
  games: GamesTable
  game_players: GamePlayersTable
  plate_appearances: PlateAppearancesTable
  runs_scored: RunsScoredTable
  game_state: GameStateTable
}
