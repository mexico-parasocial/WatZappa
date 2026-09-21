import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Client, type QueryResult } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('read-only legacy delegation audit', () => {
  const schema = `governance_audit_${randomUUID().replaceAll('-', '')}`
  const client = new Client({ connectionString: process.env.DB_POSTGRES_URL })
  beforeAll(async () => {
    await client.connect()
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}"`)
    await client.query(`CREATE TABLE para_qvld_delegation (
      creator text, delegator text, delegate text, "expiresAt" text,
      "revokedAt" text, "scopeMode" text, "scopeCommunity" text,
      "scopeTopic" text, "scopeProposal" text
    ); CREATE TABLE cabildeo_delegation (creator text, "delegateTo" text, mode text)`)
    await client.query(`INSERT INTO para_qvld_delegation VALUES
      ('demo:a','demo:victim','demo:b',null,null,'proposal',null,null,'demo:p'),
      ('demo:a','demo:a','demo:a',null,null,'proposal',null,null,'demo:p'),
      ('demo:c','demo:c','demo:b',null,null,'unknown',null,null,null);
      INSERT INTO cabildeo_delegation VALUES ('demo:a','demo:a','active'), ('demo:b',null,'passive')`)
  })
  afterAll(async () => {
    await client.query('ROLLBACK')
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await client.end()
  })
  it('reports only counts, detects unsafe historical rows and leaves data unchanged', async () => {
    const sql = await readFile(
      new URL(
        '../../../scripts/governance-delegation-audit.sql',
        import.meta.url,
      ),
      'utf8',
    )
    const before = await client.query(
      'SELECT * FROM para_qvld_delegation ORDER BY creator, delegator',
    )
    const results = (await client.query(sql)) as unknown as QueryResult[]
    expect(results.map((r) => r.command)).toEqual([
      'BEGIN',
      'SET',
      'SELECT',
      'SELECT',
      'SELECT',
      'ROLLBACK',
    ])
    expect(results[2].rows).toEqual([
      {
        total: '3',
        forged_delegator: '1',
        self_delegation: '1',
        missing_expiry: '3',
        revoked: '0',
        malformed_scope: '1',
      },
    ])
    expect(results[3].rows).toEqual([{ overlapping_scope_groups: '1' }])
    expect(results[4].rows).toEqual([
      { total: '2', self_delegation: '1', requires_party_resolver: '1' },
    ])
    expect(JSON.stringify(results.flatMap((r) => r.rows))).not.toContain(
      'demo:',
    )
    expect(
      (
        await client.query(
          'SELECT * FROM para_qvld_delegation ORDER BY creator, delegator',
        )
      ).rows,
    ).toEqual(before.rows)
  })
})
