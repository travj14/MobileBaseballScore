import { readFileSync } from 'fs'
import { join } from 'path'
import { sqlite } from './client'

export function migrate(): void {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
  sqlite.exec(schema)
}
