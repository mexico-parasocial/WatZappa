import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { IBridgeDatabase } from '../src/db/interface.js'
import { PgBridgeDatabase } from '../src/db/pg/index.js'
import { SqliteBridgeDatabase } from '../src/db/sqlite-wrapper.js'

describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s: persisted sync failures', (driver) => {
  let db: IBridgeDatabase
  let admin: pg.Pool | undefined
  let schema: string

  beforeEach(async () => {
    if (driver === 'postgres') {
      const url = new URL(process.env.MATRIX_TEST_DATABASE_URL!)
      admin = new pg.Pool({ connectionString: url.toString() })
      schema = `test_${randomUUID().replaceAll('-', '')}`
      await admin.query(`CREATE SCHEMA ${schema}`)
      url.searchParams.set('options', `-c search_path=${schema}`)
      db = new PgBridgeDatabase(url.toString())
    } else {
      db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as never)
    }
  })

  afterEach(async () => {
    await db.close()
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
      admin = undefined
    }
  })

  it('returns the fields used to retry role projection and revocation', async () => {
    const community = 'at://did:plc:owner/com.para.community.board/test'
    await db.logSync(
      'apply_roles',
      community,
      'did:plc:mod',
      '!room:para',
      false,
      'offline',
    )
    await db.logSync('revoke', community, 'did:plc:mod', null, false, 'offline')
    await db.logSync('invite', community, null, null, true)

    const failures = await db.getFailedSyncs()
    expect(failures).toHaveLength(2)
    expect(failures[0]).toEqual({
      id: expect.any(Number),
      eventType: 'revoke',
      communityUri: community,
      did: 'did:plc:mod',
      spaceId: null,
      success: 0,
      retryCount: 0,
      error: 'offline',
      createdAt: expect.any(String),
    })
    expect(failures[1]).toMatchObject({
      eventType: 'apply_roles',
      spaceId: '!room:para',
    })
    await db.incrementRetryCount(failures[0].id)
    expect((await db.getFailedSyncs(1))[0].retryCount).toBe(1)
    await db.markSyncSuccess(failures[0].id)
    expect((await db.getFailedSyncs()).map((row) => row.eventType)).toEqual([
      'apply_roles',
    ])
  })
})
