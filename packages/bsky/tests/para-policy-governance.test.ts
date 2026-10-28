import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { decodeJwt, generateKeyPair } from 'jose'
import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TID } from '@atproto/common'
import { parseCid } from '@atproto/lex'
import { AtUri } from '@atproto/syntax'
import { getDb, getMigrator } from '../../pds/src/actor-store/db/index.js'
import { ParaPolicyIntake } from '../../pds/src/actor-store/para-policy/intake.js'
import { ParaPolicyReader } from '../../pds/src/actor-store/para-policy/reader.js'
import { ParaPolicyResolver } from '../../pds/src/actor-store/para-policy/resolver.js'
import {
  down as downFoundations,
  up as upFoundations,
} from '../src/data-plane/server/db/migrations/20260416T190000000Z-add-para-community-foundations.js'
import {
  down as downRoleAssignments,
  up as upRoleAssignments,
} from '../src/data-plane/server/db/migrations/20260518T190519000Z-add-role-assignments-to-membership.js'
import {
  down as downGovernanceMode,
  up as upGovernanceMode,
} from '../src/data-plane/server/db/migrations/20260518T195000000Z-add-governance-mode-to-board.js'
import { up as upOutbox } from '../src/data-plane/server/db/migrations/20260914T180000000Z-add-para-policy-outbox.js'
import { up as upCheckpointColumns } from '../src/data-plane/server/db/migrations/20260915T000000000Z-add-para-policy-checkpoint.js'
import {
  down as downAdmission,
  up as upAdmission,
} from '../src/data-plane/server/db/migrations/20261003T000000000Z-add-para-community-admission.js'
import type { PartialDB as AdmissionDB } from '../src/data-plane/server/db/tables/para-community-admission.js'
import type { PartialDB as OutboxDB } from '../src/data-plane/server/db/tables/para-policy-outbox.js'
import { indexAdmission } from '../src/data-plane/server/indexing/plugins/para-community-admission.js'
import {
  type ParaGovernanceDB,
  ParaGovernanceError,
  materializeGovernanceMembers,
} from '../src/para-policy/governance.js'
import { ParaPolicyOutbox } from '../src/para-policy/outbox.js'
import { ParaPolicyPublicationService } from '../src/para-policy/publication-service.js'
import { ParaPolicyPublisher } from '../src/para-policy/publisher.js'

type TestDB = ParaGovernanceDB & OutboxDB & AdmissionDB

const boardDid = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd'
const boardUri = `at://${boardDid}/com.para.community.board/community-immutable-id`
const space = `at://${boardDid}/space/com.para.space.community/community-immutable-id`
const sourceCid = 'bafyreibjza57bggyhpyh4nnbkglkjetmv7nnnpb7rufpy5bky3pbmnh7am'
const alice = 'did:web:alice.example'
const bob = 'did:web:bob.example'
const carol = 'did:web:carol.example'
const dave = 'did:web:dave.example'
const eve = 'did:web:eve.example'
const collection = 'com.para.test.record'

describe('governance-authorized policy materialization (Postgres)', () => {
  let db: Kysely<TestDB>
  let schema: string
  let now: number
  const clock = () => new Date(now * 1_000)

  function connect() {
    const pool = new pg.Pool({
      connectionString:
        process.env.DB_POSTGRES_URL ??
        'postgresql://pg:password@127.0.0.1:5433/postgres',
      max: 4,
      // @NOTE match AppView's INT8-to-number parser without altering other test pools.
      types: {
        getTypeParser: (oid, format) =>
          oid === 20 ? Number : pg.types.getTypeParser(oid, format),
      },
    })
    return new Kysely<TestDB>({
      dialect: new PostgresDialect({ pool }),
    }).withSchema(schema)
  }

  beforeAll(async () => {
    now = Math.floor(Date.now() / 1_000)
  })

  beforeEach(async () => {
    schema = `governance_${randomBytes(8).toString('hex')}`
    db = connect()
    await db.schema.createSchema(schema).execute()
    await upFoundations(db as never)
    await upRoleAssignments(db as never)
    await upGovernanceMode(db as never)
    await upOutbox(db as never)
    await upCheckpointColumns(db as never)
    await upAdmission(db as never)
    await seedBoard('horizontal')
  })

  afterEach(async () => {
    // @NOTE only this test's random schema is removed; shared test services are untouched.
    await db.schema.dropSchema(schema).cascade().execute()
    await db.destroy()
  })

  async function seedBoard(governanceMode: string | null) {
    await db
      .insertInto('para_community_board')
      .values({
        uri: boardUri,
        cid: sourceCid,
        creator: boardDid,
        rkey: 'community-immutable-id',
        name: 'Community',
        description: null,
        quadrant: 'first',
        slug: 'community',
        delegatesChatId: 'delegates',
        subdelegatesChatId: 'subdelegates',
        governanceMode,
        createdAt: clock().toISOString(),
        indexedAt: clock().toISOString(),
      })
      .onConflict((oc) => oc.column('uri').doNothing())
      .execute()
  }

  async function seedMembership(
    creator: string,
    membershipState: string,
    opts: { rkey?: string; indexedAt?: string; roles?: string[] } = {},
  ) {
    const rkey = opts.rkey ?? creator.split(':').pop()
    await db
      .insertInto('para_community_membership')
      .values({
        uri: `at://${creator}/com.para.community.membership/${rkey}`,
        cid: sourceCid,
        creator,
        communityUri: boardUri,
        membershipState,
        roles: opts.roles ? sql`${JSON.stringify(opts.roles)}::jsonb` : null,
        roleAssignments: null,
        source: null,
        joinedAt: clock().toISOString(),
        leftAt: null,
        indexedAt: opts.indexedAt ?? clock().toISOString(),
      })
      .execute()
  }

  async function seedApproval(
    memberDid: string,
    state: 'active' | 'removed' | 'blocked' = 'active',
    creator = boardDid,
  ) {
    await db
      .insertInto('para_community_admission')
      .values({
        uri: `at://${creator}/com.para.community.admission/${memberDid.split(':').pop()}`,
        cid: sourceCid,
        creator,
        communityUri: boardUri,
        memberDid,
        state,
        decidedAt: clock().toISOString(),
        indexedAt: clock().toISOString(),
      })
      .execute()
  }

  function materialize(board = boardUri) {
    return db
      .transaction()
      .execute((tx) => materializeGovernanceMembers(tx, board))
  }

  it('requires the governance transaction and a real board with a known mode', async () => {
    await expect(
      materializeGovernanceMembers(db, boardUri),
    ).rejects.toBeInstanceOf(ParaGovernanceError)
    await expect(
      materialize('at://did:web:x.example/other/thing'),
    ).rejects.toBeInstanceOf(ParaGovernanceError)
    for (const mode of ['corporate', null]) {
      await db
        .updateTable('para_community_board')
        .set({ governanceMode: mode })
        .where('uri', '=', boardUri)
        .execute()
      await expect(materialize()).rejects.toThrow('Unknown governance mode')
    }
    await db
      .deleteFrom('para_community_board')
      .where('uri', '=', boardUri)
      .execute()
    await expect(materialize()).rejects.toThrow('No governance board')
  })

  it('maps states to PARA projection semantics and orders deterministically', async () => {
    await seedMembership(alice, 'active', { roles: ['moderator'] })
    await seedMembership(bob, 'pending')
    await seedMembership(carol, 'left')
    await seedMembership(dave, 'removed')
    await seedMembership(eve, 'blocked')
    for (const did of [alice, carol, dave, eve]) await seedApproval(did)

    const members = await materialize()
    expect(members).toEqual([
      { did: alice, membershipState: 'active', roles: [], roleAssignments: [] },
      { did: carol, membershipState: 'left', roles: [], roleAssignments: [] },
      { did: dave, membershipState: 'removed', roles: [], roleAssignments: [] },
      { did: eve, membershipState: 'blocked', roles: [], roleAssignments: [] },
    ])
    // @NOTE record-supplied flat roles are never carried, even for active members.
    expect(members[0]?.roles).toEqual([])
    expect(await materialize()).toEqual(members)
  })

  it('does not admit a self-declared member or a forged board approval', async () => {
    await seedMembership(alice, 'active', { roles: ['moderator'] })
    expect(await materialize()).toEqual([])
    await seedApproval(alice, 'active', 'did:web:impostor.example')
    expect(await materialize()).toEqual([])
  })

  it('honors a board revocation over a self-declared active record', async () => {
    await seedMembership(alice, 'active')
    await seedApproval(alice, 'blocked')
    expect(await materialize()).toEqual([
      {
        did: alice,
        membershipState: 'blocked',
        roles: [],
        roleAssignments: [],
      },
    ])
  })

  it('rejects forged admission and does not replay an older board decision', async () => {
    const recent = new Date(now * 1_000).toISOString()
    const old = new Date((now - 60) * 1_000).toISOString()
    const first = TID.nextStr()
    const second = TID.nextStr(first)
    const admission = (state: 'active' | 'blocked', decidedAt: string) => ({
      $type: 'com.para.community.admission' as const,
      community: boardUri,
      member: alice,
      state,
      decidedAt,
    })
    await expect(
      indexAdmission(
        db as never,
        new AtUri(
          `at://did:web:impostor.example/com.para.community.admission/${first}`,
        ),
        parseCid(sourceCid),
        admission('active', recent),
        recent,
      ),
    ).rejects.toThrow('board repository')
    await indexAdmission(
      db as never,
      new AtUri(`at://${boardDid}/com.para.community.admission/${second}`),
      parseCid(sourceCid),
      admission('blocked', recent),
      recent,
    )
    await indexAdmission(
      db as never,
      new AtUri(`at://${boardDid}/com.para.community.admission/${first}`),
      parseCid(sourceCid),
      admission('active', old),
      old,
    )
    const row = await db
      .selectFrom('para_community_admission')
      .select(['uri', 'state'])
      .where('memberDid', '=', alice)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({
      uri: `at://${boardDid}/com.para.community.admission/${second}`,
      state: 'blocked',
    })
  })

  it('publishes only board-approved members and updates revocations transactionally', async () => {
    const key = await generateKeyPair('EdDSA')
    const publisher = await ParaPolicyPublisher.create(
      {
        issuer: 'did:web:appview.para.example',
        audience: `${boardDid}#para_policy_intake`,
        space,
        sourceUri: boardUri,
        kid: 'publisher-1',
        lifetimeSec: 300,
      },
      key.privateKey,
      clock,
    )
    const service = new ParaPolicyPublicationService(publisher)
    await seedMembership(alice, 'active')
    await expect(service.publish(db as never, 'outside-tx')).rejects.toThrow(
      'requires index transaction',
    )
    const first = await db
      .transaction()
      .execute((tx) => service.publish(tx as never, 'self-join'))
    expect(first.sourceVersion).toBe(1)
    expect(
      (decodeJwt(first.assertion).delta as { members: unknown[] }).members,
    ).toEqual([])
    await seedApproval(alice)
    const approved = await db
      .transaction()
      .execute((tx) => service.publish(tx as never, 'board-approval'))
    expect(approved.sourceVersion).toBe(2)
    expect(
      (decodeJwt(approved.assertion).delta as { members: unknown[] }).members,
    ).toMatchObject([{ did: alice, membershipState: 'active', roles: [] }])
    await db
      .updateTable('para_community_admission')
      .set({ state: 'blocked' })
      .where('communityUri', '=', boardUri)
      .where('memberDid', '=', alice)
      .execute()
    const revoked = await db
      .transaction()
      .execute((tx) => service.publish(tx as never, 'board-revocation'))
    expect(revoked.sourceVersion).toBe(3)
    expect(
      (decodeJwt(revoked.assertion).delta as { members: unknown[] }).members,
    ).toMatchObject([{ did: alice, membershipState: 'blocked', roles: [] }])
    const stored = await db
      .selectFrom('para_policy_outbox')
      .select(['eventId', 'sourceVersion'])
      .orderBy('sourceVersion')
      .execute()
    expect(stored).toEqual([
      { eventId: 'self-join', sourceVersion: 1 },
      { eventId: 'board-approval', sourceVersion: 2 },
      { eventId: 'board-revocation', sourceVersion: 3 },
    ])
  })

  it('resolves duplicate membership rows by latest indexedAt deterministically', async () => {
    await seedApproval(alice)
    await seedMembership(alice, 'active', {
      rkey: 'first',
      indexedAt: new Date((now - 100) * 1_000).toISOString(),
    })
    await seedMembership(alice, 'blocked', {
      rkey: 'second',
      indexedAt: new Date((now - 50) * 1_000).toISOString(),
    })
    await seedMembership(alice, 'active', {
      rkey: 'third',
      indexedAt: new Date((now - 10) * 1_000).toISOString(),
    })
    expect(await materialize()).toEqual([
      { did: alice, membershipState: 'active', roles: [], roleAssignments: [] },
    ])
  })

  it('fails closed on an unknown membership state', async () => {
    await seedApproval(alice)
    await seedMembership(alice, 'active')
    await db
      .updateTable('para_community_membership')
      .set({ membershipState: 'shadowbanned' })
      .where('creator', '=', alice)
      .execute()
    await expect(materialize()).rejects.toThrow('Unknown membership state')
  })

  it('feeds a governance-authorized snapshot through the real publisher into the PDS resolver', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'watzappa-governance-'))
    const actorDb = getDb(path.join(directory, 'actor.sqlite'))
    try {
      await getMigrator(actorDb).migrateToLatestOrThrow()
      await actorDb.db
        .insertInto('space')
        .values({
          uri: space,
          authority: boardDid,
          type: 'com.para.space.community',
          createdAt: clock().toISOString(),
          deletedAt: null,
        })
        .execute()
      const key = await generateKeyPair('EdDSA')
      const publisher = await ParaPolicyPublisher.create(
        {
          issuer: 'did:web:appview.para.example',
          audience: `${boardDid}#para_policy_intake`,
          space,
          sourceUri: boardUri,
          kid: 'publisher-1',
          lifetimeSec: 300,
        },
        key.privateKey,
        clock,
      )
      const intake = new ParaPolicyIntake(
        actorDb,
        boardDid,
        {
          ...publisher.getBindings(),
          jwks: publisher.getJwks(),
          allowBootstrap: true,
          maxAssertionAgeSec: 300,
        },
        clock,
      )
      const reader = new ParaPolicyReader(actorDb)

      await seedMembership(alice, 'active', { roles: ['moderator'] })
      await seedMembership(bob, 'active')
      await seedMembership(eve, 'blocked')
      await seedApproval(alice)
      await seedApproval(bob)
      await seedApproval(eve, 'blocked')

      // @NOTE materialization and enqueue share one governance transaction;
      // nothing reads the membership tables outside it.
      const prepared = await db.transaction().execute(async (tx) => {
        const members = await materializeGovernanceMembers(tx, boardUri)
        const outbox = new ParaPolicyOutbox(
          tx.$pickTables<'para_policy_publication' | 'para_policy_outbox'>(),
          publisher,
          clock,
        )
        return outbox.enqueue('governance-snapshot', {
          kind: 'snapshot',
          sourceCid,
          members,
        })
      })
      expect(prepared.sourceVersion).toBe(1)
      await intake.ingest(prepared.assertion)
      expect(await reader.getPolicyMember(space, eve)).toMatchObject({
        membershipState: 'blocked',
      })

      const resolver = new ParaPolicyResolver(
        [
          {
            space,
            collection,
            action: 'create',
            clientIds: ['client'],
            roles: [],
          },
        ],
        600_000,
      )
      const decision = async (principal: string) => {
        const input = await actorDb.transaction((tx) =>
          new ParaPolicyReader(tx).getPolicyInput(space, principal),
        )
        return resolver.resolve(
          {
            space,
            principalDid: principal,
            collection,
            action: 'create',
            clientId: 'client',
            policyEpoch: 1,
            now: Date.now(),
          },
          input,
        )
      }
      // @NOTE admission only: active members pass the empty-role rule, the
      // blocked member is denied, and self-supplied roles granted nothing.
      expect(await decision(alice)).toMatchObject({ allowed: true })
      expect(await decision(bob)).toMatchObject({ allowed: true })
      expect(await decision(eve)).toMatchObject({
        allowed: false,
        denial: 'not-active-member',
      })
    } finally {
      await actorDb.db.destroy()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('round-trips its migrations without losing the board roster', async () => {
    await seedMembership(alice, 'active')
    await sql`select 1`.execute(db)
    await downAdmission(db as never)
    await downGovernanceMode(db as never)
    await downRoleAssignments(db as never)
    await downFoundations(db as never)
    await upFoundations(db as never)
    await upRoleAssignments(db as never)
    await upGovernanceMode(db as never)
    await upAdmission(db as never)
    await seedBoard('horizontal')
    await seedMembership(alice, 'active')
    await seedApproval(alice)
    expect(await materialize()).toEqual([
      { did: alice, membershipState: 'active', roles: [], roleAssignments: [] },
    ])
  })
})
