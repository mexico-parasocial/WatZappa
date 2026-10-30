import Database from 'better-sqlite3'
import pg from 'pg'
import type { Config } from './config.js'

export type OpsAudit = {
  requestId: string
  operator: string
  action: string
  target: string
  reason: string
  result: string
  created: string
}

/**
 * Small durable control-plane store for the private operations listener, in
 * the same backed-up bridge database: the operator audit trail, written
 * before any side effect.
 */
export class ControlStore {
  private sqlite?: Database.Database
  private pool?: pg.Pool
  private ready: Promise<void>

  constructor(config: Pick<Config, 'databaseUrl' | 'dbPath'>) {
    if (config.databaseUrl)
      this.pool = new pg.Pool({ connectionString: config.databaseUrl, max: 3 })
    else {
      this.sqlite = new Database(config.dbPath)
      this.sqlite.pragma('busy_timeout = 5000')
    }
    this.ready = this.initialize()
  }

  private async raw(sql: string, values: unknown[] = []): Promise<any[]> {
    if (this.pool) return (await this.pool.query(sql, values)).rows
    const ordered: unknown[] = []
    const statement = this.sqlite!.prepare(
      sql.replace(/\$(\d+)/g, (_, index) => {
        ordered.push(values[Number(index) - 1])
        return '?'
      }),
    )
    if (statement.reader) return statement.all(...ordered)
    statement.run(...ordered)
    return []
  }
  private async initialize(): Promise<void> {
    await this.raw(`CREATE TABLE IF NOT EXISTS chat_ops_audit (
      request_id TEXT PRIMARY KEY, operator TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL,
      reason TEXT NOT NULL, result TEXT NOT NULL, created TEXT NOT NULL)`)
  }
  async query(sql: string, values: unknown[] = []): Promise<any[]> {
    await this.ready
    return this.raw(sql, values)
  }
  async beginAudit(
    entry: Omit<OpsAudit, 'result' | 'created'>,
  ): Promise<boolean> {
    const rows = await this.query(
      `INSERT INTO chat_ops_audit (request_id,operator,action,target,reason,result,created)
      VALUES ($1,$2,$3,$4,$5,'running',$6) ON CONFLICT (request_id) DO NOTHING RETURNING request_id`,
      [
        entry.requestId,
        entry.operator,
        entry.action,
        entry.target,
        entry.reason,
        new Date().toISOString(),
      ],
    )
    return rows.length === 1
  }
  async finishAudit(id: string, result: string): Promise<void> {
    await this.query(
      'UPDATE chat_ops_audit SET result=$2 WHERE request_id=$1',
      [id, result],
    )
  }
  async audit(): Promise<OpsAudit[]> {
    return this.query(
      `SELECT request_id AS "requestId",operator,action,target,reason,result,created FROM chat_ops_audit ORDER BY created DESC,request_id LIMIT 100`,
    )
  }
  async close(): Promise<void> {
    await this.ready
    await this.pool?.end()
    this.sqlite?.close()
  }
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }
}
