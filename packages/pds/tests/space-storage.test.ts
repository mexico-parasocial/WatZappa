import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { encode } from '@atproto/lex-cbor'
import { cidForCbor } from '@atproto/lex-data'
import { WriteOpAction } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'
import { BlobTransactor } from '../src/actor-store/blob/transactor.js'
import {
  type ActorDb,
  getDb,
  getMigrator,
} from '../src/actor-store/db/index.js'
import { SpaceReader } from '../src/actor-store/space/reader.js'
import { SpaceTransactor } from '../src/actor-store/space/transactor.js'
import type { BackgroundQueue } from '../src/background.js'

const authority = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd'
const space = AtUri.makeSpace(
  authority,
  'com.para.space.personal',
  'civic-tree',
)
  .spaceRef()!
  .toString()
const uri = AtUri.makeSpace(
  authority,
  'com.para.space.personal',
  'civic-tree',
  authority,
  'com.para.highlight',
  'first',
)

describe('permissioned space storage', () => {
  let directory: string
  let db: ActorDb
  let reader: SpaceReader

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'watzappa-space-storage-'))
    db = getDb(path.join(directory, 'actor.sqlite'))
    await getMigrator(db).migrateToLatestOrThrow()
    reader = new SpaceReader(db)
  })

  afterEach(async () => {
    db.close()
    await rm(directory, { recursive: true, force: true })
  })

  const transactor = (actorDb: ActorDb) => {
    // These tests do not exercise blobs. The transactor nevertheless receives
    // its normal collaborator so space writes use the production code path.
    const blob = new BlobTransactor(
      actorDb,
      {} as never,
      { add: () => undefined } as unknown as BackgroundQueue,
    )
    return new SpaceTransactor(actorDb, blob)
  }

  it('migrates, writes, and reads a member-list space', async () => {
    const first = { $type: 'com.para.highlight', text: 'first' }
    const second = { $type: 'com.para.highlight', text: 'second' }
    const firstCid = await cidForCbor(encode(first))
    const secondCid = await cidForCbor(encode(second))

    await db.transaction(async (tx) => {
      const store = transactor(tx)
      await store.createSpace(space, {
        policy: 'member-list',
        managingApp: null,
        appAccessType: 'open',
        appAllowed: '[]',
      })
      await store.addMember(space, authority)
      await store.applyWrites(space, [
        {
          action: WriteOpAction.Create,
          uri,
          cid: firstCid,
          swapCid: null,
          record: first,
          blobs: [],
          validationStatus: 'unknown',
        },
      ])
      await store.applyWrites(space, [
        {
          action: WriteOpAction.Update,
          uri,
          cid: secondCid,
          swapCid: firstCid,
          record: second,
          blobs: [],
          validationStatus: 'unknown',
        },
      ])
    })

    expect(await reader.isMember(space, authority)).toBe(true)
    expect((await reader.getRecord(uri.toString()))?.value).toEqual(second)

    const ops = await reader.listRepoOps(space, { limit: 10 })
    expect(ops).toHaveLength(2)
    // The first write was superseded; the oplog carries its metadata but not a
    // stale record value. The current write remains joinable to its value.
    expect(ops[0]?.value).toBeUndefined()
    expect(ops[1]?.value).toEqual(second)
  })

  it('tombstones a deleted space while removing its records and policy', async () => {
    await db.transaction(async (tx) => {
      const store = transactor(tx)
      await store.createSpace(space, {
        policy: 'member-list',
        managingApp: null,
        appAccessType: 'open',
        appAllowed: '[]',
      })
      const record = { $type: 'com.para.highlight', text: 'delete me' }
      await store.applyWrites(space, [
        {
          action: WriteOpAction.Create,
          uri,
          cid: await cidForCbor(encode(record)),
          swapCid: null,
          record,
          blobs: [],
          validationStatus: 'unknown',
        },
      ])
      await store.deleteSpace(space)
    })

    expect((await reader.getSpace(space))?.deletedAt).toBeTruthy()
    expect(await reader.getSpaceConfig(space)).toBeNull()
    expect(await reader.getRecord(uri.toString())).toBeNull()
    await expect(reader.getActiveSpaceConfig(space)).rejects.toMatchObject({
      error: 'SpaceNotFound',
    })
  })
})
