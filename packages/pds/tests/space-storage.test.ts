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
const member = 'did:plc:z72i7hdynmk6r22z27h6tvur'
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
        readPolicy: 'member-list',
        readManagingApp: null,
        writePolicy: 'member-list',
        writeManagingApp: null,
        appAccessType: 'open',
        appAllowed: '[]',
      })
      await store.putMember(space, authority, { read: true, write: true })
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

    expect(await reader.getMember(space, authority)).toEqual({
      did: authority,
      read: 1,
      write: 1,
    })
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
        readPolicy: 'member-list',
        readManagingApp: null,
        writePolicy: 'member-list',
        writeManagingApp: null,
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

  // Guards the storage contract the (not-yet-wired) access resolver will read.
  // `getMember` returns the per-member read/write bits verbatim, `putMember`
  // replaces them, and a non-member reads back as undefined — so a resolver can
  // treat "no row" as "no access" and trust the bits for everyone else. See B1
  // in plans/solidarity-social-recon.md context: the split read/write policy
  // storage landed before any code consumes it; this pins its meaning first.
  it('stores, replaces, and distinguishes per-member read/write access', async () => {
    await db.transaction(async (tx) => {
      const store = transactor(tx)
      await store.createSpace(space, {
        readPolicy: 'member-list',
        readManagingApp: null,
        writePolicy: 'member-list',
        writeManagingApp: null,
        appAccessType: 'open',
        appAllowed: '[]',
      })
      // A reader-only member: may read under the member-list read policy, but
      // is not a tracked writer.
      await store.putMember(space, member, { read: true, write: false })
    })

    expect(await reader.getMember(space, member)).toEqual({
      did: member,
      read: 1,
      write: 0,
    })

    // putMember replaces both bits rather than merging — granting write must be
    // explicit and must not silently preserve a stale read grant either.
    await db.transaction(async (tx) => {
      await transactor(tx).putMember(space, member, { read: false, write: true })
    })
    expect(await reader.getMember(space, member)).toEqual({
      did: member,
      read: 0,
      write: 1,
    })

    // A DID that was never added has no row; the resolver reads this as "no
    // access" under a member-list policy.
    expect(
      await reader.getMember(space, 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toBeUndefined()

    // listMembers carries the bits so a member-list projection can render who
    // may read vs write without a second query.
    const members = await reader.listMembers(space, { limit: 10 })
    expect(members).toContainEqual({ did: member, read: 0, write: 1 })
  })
})
