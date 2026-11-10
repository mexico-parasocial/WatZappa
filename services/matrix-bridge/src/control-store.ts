import { createHash } from 'node:crypto'
import Database from 'better-sqlite3'
import pg from 'pg'
import type { Config } from './config.js'

export type ProvisionInput = {
  communityUri: string
  name: string
  slug: string
  chamberMode: string
}
export type ProvisionJob = {
  id: string
  input: string
  state: string
  attempts: number
  updated: string
}
export type OpsAudit = {
  requestId: string
  operator: string
  action: string
  target: string
  reason: string
  result: string
  created: string
}

/** Small durable control-plane store, in the same backed-up bridge database. */
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
    await this.raw(`CREATE TABLE IF NOT EXISTS chat_provision_jobs (
      id TEXT PRIMARY KEY, input TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      updated TEXT NOT NULL, lease_until TEXT NOT NULL DEFAULT '')`)
    await this.raw(`CREATE TABLE IF NOT EXISTS chat_ops_audit (
      request_id TEXT PRIMARY KEY, operator TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL,
      reason TEXT NOT NULL, result TEXT NOT NULL, created TEXT NOT NULL)`)
  }
  async query(sql: string, values: unknown[] = []): Promise<any[]> {
    await this.ready
    return this.raw(sql, values)
  }
  async enqueue(input: ProvisionInput): Promise<string> {
    const id = createHash('sha256').update(input.communityUri).digest('hex')
    await this.query(
      `INSERT INTO chat_provision_jobs (id,input,state,updated) VALUES ($1,$2,'pending',$3) ON CONFLICT (id) DO NOTHING`,
      [id, JSON.stringify(input), new Date().toISOString()],
    )
    return id
  }
  async claim(id: string, manual = false): Promise<ProvisionJob | undefined> {
    const now = new Date().toISOString()
    const rows = await this.query(
      `UPDATE chat_provision_jobs SET state='running', attempts=attempts+1, updated=$2, lease_until=$3
      WHERE id=$1 AND (state IN ('pending','failed') OR (state='running' AND lease_until<$2))
      ${manual ? '' : 'AND attempts<5'} RETURNING *`,
      [id, now, new Date(Date.now() + 600000).toISOString()],
    )
    return rows[0]
  }
  async finish(
    id: string,
    state: 'done' | 'failed',
    attempts: number,
  ): Promise<void> {
    await this.query(
      "UPDATE chat_provision_jobs SET state=$2, updated=$3, lease_until='' WHERE id=$1 AND state='running' AND attempts=$4",
      [id, state, new Date().toISOString(), attempts],
    )
  }
  async jobs(): Promise<ProvisionJob[]> {
    return this.query(
      'SELECT id,input,state,attempts,updated FROM chat_provision_jobs ORDER BY updated DESC,id LIMIT 100',
    )
  }
  async pending(): Promise<ProvisionJob[]> {
    // A crash during the final automatic attempt must still leave a job that
    // an operator can retry, rather than an eternal running row.
    await this.query(
      `UPDATE chat_provision_jobs SET state='failed', updated=$1, lease_until=''
      WHERE state='running' AND attempts>=5 AND lease_until<$1`,
      [new Date().toISOString()],
    )
    return this.query(
      `SELECT id,input,state,attempts,updated FROM chat_provision_jobs
      WHERE attempts<5 AND (state IN ('pending','failed') OR (state='running' AND lease_until<$1)) ORDER BY updated LIMIT 20`,
      [new Date().toISOString()],
    )
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
