import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PgBridgeDatabase } from '../src/db/pg/index.js'

const connectionString = process.env.MATRIX_TEST_DATABASE_URL

describe.skipIf(!connectionString)('PostgreSQL bridge persistence', () => {
  let db: PgBridgeDatabase
  let pool: pg.Pool
  beforeAll(() => {
    db = new PgBridgeDatabase(connectionString!)
    pool = new pg.Pool({ connectionString })
  })
  afterAll(async () => {
    await db.close()
    await pool.end()
  })

  it('returns numeric metrics instead of pg int8 strings', async () => {
    expect(await db.getUserCount()).toBe(0)
    expect(await db.getSpaceCount()).toBe(0)
    expect(await db.getSortitionProofCount()).toBe(0)
    expect(await db.getUnreadCount('did:plc:test', '!test:pg.test')).toBe(0)
  })

  it('preserves a relay cursor beyond 32 bits across reopening', async () => {
    const cursor = Number.MAX_SAFE_INTEGER - 1
    await db.setSyncSource('pg-test-rsky-v1')
    await db.setSyncCursor(cursor)
    const reopened = new PgBridgeDatabase(connectionString!)
    try {
      expect(await reopened.getSyncCursor()).toBe(cursor)
      expect(await reopened.getSyncSource()).toBe('pg-test-rsky-v1')
    } finally {
      await reopened.close()
    }
  })

  it('rejects unsafe cursors on writing and reading', async () => {
    await expect(db.setSyncCursor(Number.MAX_SAFE_INTEGER + 1)).rejects.toThrow(
      'safe integer',
    )
    await pool.query(
      "UPDATE sync_cursor SET cursor = '9007199254740992' WHERE id = 1",
    )
    await expect(db.getSyncCursor()).rejects.toThrow('safe integer')
    await db.setSyncCursor(10)
  })

  it('returns the community space fields consumed by Matrix routes', async () => {
    const uri = 'at://did:plc:pgtest/com.para.community.board/pgtest'
    await db.setSpaceForCommunity(uri, '!space:pg.test', 'pgtest', 'bicameral')
    await db.setChamberRooms(
      uri,
      '!a:pg.test',
      '!b:pg.test',
      '!observer:pg.test',
    )
    expect(await db.getSpaceForCommunity(uri)).toMatchObject({
      communityUri: uri,
      spaceId: '!space:pg.test',
      chamberMode: 'bicameral',
      chamberA_RoomId: '!a:pg.test',
      chamberB_RoomId: '!b:pg.test',
      observerRoomId: '!observer:pg.test',
    })
    expect(await db.getSpaceCount()).toBe(1)
  })

  it('returns the device fields used for revocation and admission', async () => {
    const session = {
      id: 'pg-test-device',
      did: 'did:plc:test',
      mxid: '@key:pg.test',
      deviceId: 'ACTUAL_SDK_DEVICE',
      friendlyName: 'Test',
      userAgent: null,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      revokedAt: null,
    }
    await db.createDeviceSession(session)
    expect(await db.getDeviceSession(session.id)).toEqual(session)
    expect(await db.revokeDeviceSession(session.did, session.id)).toBe(true)
    expect((await db.getDeviceSession(session.id))?.revokedAt).not.toBeNull()
  })
})
