import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import type { DB } from '../types'

const DB_PATH = process.env.DATABASE_PATH ?? './data/baseball.db'

mkdirSync(dirname(DB_PATH), { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = new Kysely<DB>({
  dialect: new SqliteDialect({ database: sqlite }),
})

export { sqlite }
