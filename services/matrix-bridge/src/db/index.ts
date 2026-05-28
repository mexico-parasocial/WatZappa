import type { Config } from '../config.js'
import type { IBridgeDatabase } from './pg.js'
import { PgBridgeDatabase } from './pg.js'
import { SqliteBridgeDatabase } from './sqlite-wrapper.js'

export type { IBridgeDatabase }
export { PgBridgeDatabase, SqliteBridgeDatabase }

export function createDatabase(config: Config): IBridgeDatabase {
  if (config.databaseUrl) {
    return new PgBridgeDatabase(config.databaseUrl)
  }
  return new SqliteBridgeDatabase(config)
}
