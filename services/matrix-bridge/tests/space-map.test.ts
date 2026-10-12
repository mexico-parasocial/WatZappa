import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { IBridgeDatabase } from '../src/db/interface.js'
import { PgBridgeDatabase } from '../src/db/pg/index.js'
import { SqliteBridgeDatabase } from '../src/db/sqlite-wrapper.js'

/*
 * Both drivers return a community's rooms in the same camelCase shape. On
 * Postgres this was the raw snake_case row, so `space.spaceId` and the chamber
 * rooms were undefined and the projection built an empty room list.
 */
describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s: community space map', (driver) => {
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
    }
  })

  it('returns camelCase fields, including the chamber and observer rooms', async () => {
    await db.setSpaceForCommunity('at://c', '!main:para', 'one', 'bicameral')
    await db.setChamberRooms('at://c', '!a:para', '!b:para', '!obs:para')

    const space = await db.getSpaceForCommunity('at://c')
    expect(space).toMatchObject({
      communityUri: 'at://c',
      spaceId: '!main:para',
      slug: 'one',
      chamberMode: 'bicameral',
      chamberA_RoomId: '!a:para',
      chamberB_RoomId: '!b:para',
      observerRoomId: '!obs:para',
    })
    expect(typeof space?.createdAt).toBe('string')
    expect(space).not.toHaveProperty('space_id')
  })

  it('is undefined for an unknown community', async () => {
    expect(await db.getSpaceForCommunity('at://nope')).toBeUndefined()
  })
})
