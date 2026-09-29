import { afterAll, expect, it } from 'vitest'
import { Database } from '../src/data-plane/server/db/index.js'

const db = new Database({
  url: process.env.DB_POSTGRES_URL!,
  schema: 'bsky_migration_order_regression',
})

afterAll(async () => {
  await db.db.schema.dropSchema(db.schema!).ifExists().cascade().execute()
  await db.close()
})

it('upgrades the September 25 schema without reordering history or losing actor state', async () => {
  await db.migrateToOrThrow('_20260925T120000000Z')
  const state = {
    did: 'did:plc:abcdefghijklmnopqrstuvwx',
    lastSeenNotifs: '2026-09-25T12:00:00.000Z',
  }
  await db.db.insertInto('actor_state').values(state).execute()

  const results = await db.migrateToLatestOrThrow()
  expect(results.map((result) => result.migrationName)).toEqual([
    '_20260926T120000000Z',
  ])
  const row = await db.db
    .selectFrom('actor_state')
    .selectAll()
    .where('did', '=', state.did)
    .executeTakeFirstOrThrow()
  expect(row).toMatchObject(state)
  expect(row).not.toHaveProperty('priorityNotifs')
})
