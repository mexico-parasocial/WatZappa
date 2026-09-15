import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateKeyPair } from 'jose'
import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import {
  afterEach,
  assert,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { getDb, getMigrator } from '../../pds/src/actor-store/db/index.js'
import { ParaPolicyIntake } from '../../pds/src/actor-store/para-policy/intake.js'
import { ParaPolicyReader } from '../../pds/src/actor-store/para-policy/reader.js'
import {
  down,
  up,
} from '../src/data-plane/server/db/migrations/20260914T180000000Z-add-para-policy-outbox.js'
import type { PartialDB } from '../src/data-plane/server/db/tables/para-policy-outbox.js'
import {
  type ParaPolicyChange,
  ParaPolicyOutbox,
} from '../src/para-policy/outbox.js'
import { ParaPolicyPublisher } from '../src/para-policy/publisher.js'

const space =
  'at://did:plc:ragtjsm2j2vknwkz3zp4oxrd/space/com.para.space.community/community-immutable-id'
const sourceUri =
  'at://did:plc:ragtjsm2j2vknwkz3zp4oxrd/com.para.community.board/community-immutable-id'
const sourceCid = 'bafyreibjza57bggyhpyh4nnbkglkjetmv7nnnpb7rufpy5bky3pbmnh7am'
const member = 'did:web:member.example'

describe('durable policy outbox (Postgres)', () => {
  let db: Kysely<PartialDB & { governance_marker: { id: number } }>
  let schema: string
  let publisher: ParaPolicyPublisher
  let outbox: ParaPolicyOutbox
  let now: number
  let key: Awaited<ReturnType<typeof generateKeyPair>>
  const clock = () => new Date(now * 1_000)
  const config = {
    issuer: 'did:web:appview.para.example',
    audience: 'pds#para_policy_intake',
    space,
    sourceUri,
    kid: 'publisher-1',
    lifetimeSec: 300,
  }

  function connect() {
    const pool = new pg.Pool({
      connectionString:
        process.env.DB_POSTGRES_URL ??
        'postgresql://pg:password@127.0.0.1:5433/postgres',
      max: 8,
      // @NOTE match AppView's INT8-to-number parser without altering other test pools.
      types: {
        getTypeParser: (oid, format) =>
          oid === 20 ? Number : pg.types.getTypeParser(oid, format),
      },
    })
    return new Kysely<PartialDB & { governance_marker: { id: number } }>({
      dialect: new PostgresDialect({ pool }),
    }).withSchema(schema)
  }

  beforeAll(async () => {
    key = await generateKeyPair('EdDSA')
  })
  beforeEach(async () => {
    schema = `policy_outbox_${randomBytes(8).toString('hex')}`
    db = connect()
    await db.schema.createSchema(schema).execute()
    await up(db as Kysely<unknown>)
    await db.schema
      .createTable('governance_marker')
      .addColumn('id', 'integer', (col) => col.primaryKey())
      .execute()
    now = Math.floor(Date.now() / 1_000)
    publisher = await ParaPolicyPublisher.create(config, key.privateKey, clock)
    outbox = makeOutbox()
  })
  afterEach(async () => {
    // @NOTE only this test's random schema is removed; shared test services are untouched.
    await db.schema.dropSchema(schema).cascade().execute()
    await db.destroy()
  })

  function change(overrides: Partial<ParaPolicyChange> = {}): ParaPolicyChange {
    return {
      kind: 'snapshot',
      sourceCid,
      members: [
        { did: member, membershipState: 'active', roles: ['moderator'] },
      ],
      ...overrides,
    }
  }
  function enqueue(eventId: string, input = change()) {
    return db
      .transaction()
      .execute((tx) => makeOutbox(tx).enqueue(eventId, input))
  }
  function makeOutbox(connection = db, signer = publisher) {
    return new ParaPolicyOutbox(
      connection.$pickTables<keyof PartialDB>(),
      signer,
      clock,
    )
  }
  async function stream() {
    return db
      .selectFrom('para_policy_publication')
      .selectAll()
      .where('space', '=', space)
      .executeTakeFirstOrThrow()
  }

  it('requires the governance transaction and commits its mutation with the signed bytes', async () => {
    await expect(outbox.enqueue('event-1', change())).rejects.toThrow(
      'governance transaction',
    )
    const prepared = await db.transaction().execute(async (tx) => {
      await sql`insert into ${sql.table(`${schema}.governance_marker`)} (id) values (1)`.execute(
        tx,
      )
      return makeOutbox(tx).enqueue('event-1', change())
    })
    expect(prepared.sourceVersion).toBe(1)
    expect(await stream()).toMatchObject({
      sourceVersion: 1,
      policyEpoch: 1,
      projectionDigest: prepared.projectionDigest,
    })
    const delivery = await outbox.claim()
    assert(delivery.status === 'claimed')
    expect(delivery.update).toEqual(prepared)
    const markers =
      await sql`select * from ${sql.table(`${schema}.governance_marker`)}`.execute(
        db,
      )
    expect(markers.rows).toHaveLength(1)
  })

  it('rolls back governance, signed bytes and sequence allocation together', async () => {
    await expect(
      db.transaction().execute(async (tx) => {
        await sql`insert into ${sql.table(`${schema}.governance_marker`)} (id) values (1)`.execute(
          tx,
        )
        await makeOutbox(tx).enqueue('event-1', change())
        throw new Error('forced governance failure')
      }),
    ).rejects.toThrow('forced governance failure')
    expect(await outbox.claim()).toEqual({ status: 'empty' })
    expect(
      (
        await sql`select * from ${sql.table(`${schema}.governance_marker`)}`.execute(
          db,
        )
      ).rows,
    ).toEqual([])
    expect((await enqueue('event-1')).sourceVersion).toBe(1)
  })

  it('rolls back the allocated stream when signing or persistence fails', async () => {
    const members = Array.from({ length: 200 }, (_, index) => ({
      did: `did:web:m-${index}.example`,
      membershipState: 'active' as const,
    }))
    await expect(enqueue('large', change({ members }))).rejects.toThrow(
      'receiver limit',
    )
    expect(await outbox.claim()).toEqual({ status: 'empty' })
    await db.schema
      .alterTable('para_policy_outbox')
      .addCheckConstraint('reject_test_event', sql`"eventId" <> 'reject'`)
      .execute()
    await expect(enqueue('reject')).rejects.toThrow('reject_test_event')
    expect((await enqueue('valid')).sourceVersion).toBe(1)
  })

  it('serializes concurrent allocations and preserves event idempotency', async () => {
    const initial = await Promise.all([
      enqueue('bootstrap'),
      enqueue('bootstrap'),
    ])
    expect(initial[0]).toEqual(initial[1])
    const next = await Promise.all([
      enqueue('event-2', change({ kind: 'patch' })),
      enqueue('event-3', change({ kind: 'patch' })),
    ])
    expect(next.map((item) => item.sourceVersion).sort()).toEqual([2, 3])
    expect(await stream()).toMatchObject({ sourceVersion: 3, policyEpoch: 3 })
    await expect(enqueue('bootstrap', change({ members: [] }))).rejects.toThrow(
      'different material',
    )
  })

  it('returns the original bytes on a semantic retry without signing again', async () => {
    const first = await enqueue(
      'event-1',
      change({ members: [{ did: member, membershipState: 'active' }] }),
    )
    now += 5
    const retried = await enqueue(
      'event-1',
      change({
        members: [
          {
            did: member,
            membershipState: 'active',
            roles: [],
            roleAssignments: [],
          },
        ],
      }),
    )
    expect(retried).toEqual(first)
    expect(await stream()).toMatchObject({ sourceVersion: 1 })
  })

  it('leases only one worker and only advances after an exact acknowledgement', async () => {
    const first = await enqueue('event-1')
    const second = await enqueue('event-2', change({ kind: 'patch' }))
    const competing = await Promise.all([outbox.claim(), makeOutbox().claim()])
    expect(competing.filter((item) => item.status === 'busy')).toHaveLength(1)
    const claimed = competing.find((item) => item.status === 'claimed')
    assert(claimed?.status === 'claimed')
    expect(claimed.update).toEqual(first)
    expect(
      await outbox.acknowledge(2, second.projectionDigest, claimed.leaseToken),
    ).toBe(false)
    expect(
      await outbox.acknowledge(1, '0'.repeat(64), claimed.leaseToken),
    ).toBe(false)
    expect(
      await outbox.acknowledge(1, first.projectionDigest, 'wrong-token'),
    ).toBe(false)
    expect(await outbox.claim()).toEqual({ status: 'busy' })
    expect(
      await outbox.acknowledge(1, first.projectionDigest, claimed.leaseToken),
    ).toBe(true)
    expect(
      await outbox.acknowledge(1, first.projectionDigest, claimed.leaseToken),
    ).toBe(false)
    const next = await outbox.claim()
    assert(next.status === 'claimed')
    expect(next.update).toEqual(second)
  })

  it('recovers a worker lease without regenerating bytes and fences the old worker', async () => {
    const first = await enqueue('event-1')
    const claimed = await outbox.claim()
    assert(claimed.status === 'claimed')
    now += 30
    const retry = await outbox.claim()
    assert(retry.status === 'claimed')
    expect(retry.update).toEqual(first)
    expect(retry.leaseToken).not.toBe(claimed.leaseToken)
    expect(
      await outbox.acknowledge(1, first.projectionDigest, claimed.leaseToken),
    ).toBe(false)
    expect(
      await outbox.acknowledge(1, first.projectionDigest, retry.leaseToken),
    ).toBe(true)
    expect(await outbox.claim()).toEqual({ status: 'empty' })
  })

  it('persists pending bytes, leases and acknowledgements across reconnection', async () => {
    const first = await enqueue('event-1')
    const claimed = await outbox.claim()
    assert(claimed.status === 'claimed')
    await db.destroy()
    db = connect()
    outbox = makeOutbox()
    expect(await enqueue('event-1')).toEqual(first)
    expect(await outbox.claim()).toEqual({ status: 'busy' })
    expect(
      await outbox.acknowledge(1, first.projectionDigest, claimed.leaseToken),
    ).toBe(true)
    await db.destroy()
    db = connect()
    outbox = makeOutbox()
    expect(await outbox.claim()).toEqual({ status: 'empty' })
    expect(await enqueue('event-1')).toEqual(first)
  })

  it('latches expired head delivery instead of skipping to a newer queued update', async () => {
    const first = await enqueue('event-1')
    now += 10
    await enqueue('event-2', change({ kind: 'patch' }))
    now = first.expiresAt
    expect(await outbox.claim()).toEqual({ status: 'recovery-required' })
    expect(await stream()).toMatchObject({
      acknowledgedVersion: 0,
      deliveryStatus: 'recovery-required',
    })
    await expect(enqueue('event-3')).rejects.toThrow('requires recovery')
    expect(await enqueue('event-1')).toEqual(first)
    const restarted = makeOutbox()
    expect(await restarted.claim()).toEqual({ status: 'recovery-required' })
  })

  it('allows an in-flight authenticated response after token expiry while its lease is live', async () => {
    const first = await enqueue('event-1')
    now = first.expiresAt - 1
    const claimed = await outbox.claim()
    assert(claimed.status === 'claimed')
    now += 2
    expect(await outbox.claim()).toEqual({ status: 'busy' })
    expect(
      await outbox.acknowledge(1, first.projectionDigest, claimed.leaseToken),
    ).toBe(true)
  })

  it('rejects implicit stream-source changes but allows a signing-key rotation', async () => {
    const first = await enqueue('event-1')
    const changed = await ParaPolicyPublisher.create(
      { ...config, audience: 'another-pds' },
      key.privateKey,
      clock,
    )
    await expect(makeOutbox(db, changed).claim()).rejects.toThrow(
      'source binding changed',
    )
    const nextKey = await generateKeyPair('EdDSA')
    const rotated = await ParaPolicyPublisher.create(
      { ...config, kid: 'publisher-2' },
      nextKey.privateKey,
      clock,
    )
    const saved = await db
      .transaction()
      .execute((tx) => makeOutbox(tx, rotated).enqueue('event-1', change()))
    expect(saved).toEqual(first)
  })

  it('enforces bootstrap, reserved fields, pending bounds and transaction boundaries', async () => {
    await expect(
      enqueue('patch-first', change({ kind: 'patch' })),
    ).rejects.toThrow('full snapshot')
    await expect(
      enqueue('reserved', {
        ...change(),
        sourceVersion: 99,
      } as ParaPolicyChange),
    ).rejects.toThrow('Invalid policy outbox event')
    for (let i = 0; i < 100; i++) await enqueue(`event-${i}`)
    await expect(enqueue('overflow')).rejects.toThrow('pending limit')
    await expect(
      db.transaction().execute((tx) => makeOutbox(tx).claim()),
    ).rejects.toThrow('own committed transaction')
  })

  it('round-trips its migration without altering an unrelated governance table', async () => {
    await sql`insert into ${sql.table(`${schema}.governance_marker`)} (id) values (1)`.execute(
      db,
    )
    await down(db as Kysely<unknown>)
    await up(db as Kysely<unknown>)
    expect(
      (
        await sql`select * from ${sql.table(`${schema}.governance_marker`)}`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(1)
    expect((await enqueue('event-1')).sourceVersion).toBe(1)
  })

  it('delivers persisted Postgres envelopes in order through the real PDS intake', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'watzappa-outbox-pds-'))
    const actorDb = getDb(path.join(directory, 'actor.sqlite'))
    try {
      await getMigrator(actorDb).migrateToLatestOrThrow()
      await actorDb.db
        .insertInto('space')
        .values({
          uri: space,
          authority: 'did:plc:ragtjsm2j2vknwkz3zp4oxrd',
          type: 'com.para.space.community',
          createdAt: clock().toISOString(),
          deletedAt: null,
        })
        .execute()
      const intake = new ParaPolicyIntake(
        actorDb,
        'did:plc:ragtjsm2j2vknwkz3zp4oxrd',
        {
          ...publisher.getBindings(),
          jwks: publisher.getJwks(),
          allowBootstrap: true,
          maxAssertionAgeSec: 300,
        },
        clock,
      )
      const reader = new ParaPolicyReader(actorDb)
      await enqueue('admitted')
      const firstDelivery = await outbox.claim()
      assert(firstDelivery.status === 'claimed')
      await intake.ingest(firstDelivery.update.assertion)
      // @NOTE lose the acknowledgement, then let the first artifact expire.
      now += 10
      await enqueue(
        'removed',
        change({
          kind: 'patch',
          members: [{ did: member, membershipState: 'removed' }],
        }),
      )
      now = firstDelivery.update.expiresAt
      expect(await outbox.claim()).toEqual({ status: 'recovery-required' })
      const receipt = await intake.getAcceptedReceipt()
      assert(receipt)
      const stateBefore = await reader.getPolicyState(space)
      expect(await outbox.reconcileAccepted(receipt)).toBe(true)
      expect(await reader.getPolicyState(space)).toEqual(stateBefore)
      const delivery = await outbox.claim()
      assert(delivery.status === 'claimed')
      expect(delivery.update.sourceVersion).toBe(2)
      await intake.ingest(delivery.update.assertion)
      const accepted = await reader.getPolicyState(space)
      assert(accepted)
      expect(accepted.projectionDigest).toBe(delivery.update.projectionDigest)
      expect(
        await outbox.acknowledge(
          accepted.sourceVersion,
          accepted.projectionDigest,
          delivery.leaseToken,
        ),
      ).toBe(true)
      expect(await reader.getPolicyMember(space, member)).toMatchObject({
        membershipState: 'removed',
      })
      expect(await outbox.claim()).toEqual({ status: 'empty' })
    } finally {
      await actorDb.db.destroy()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects mismatched or non-ready reconciliation without moving the delivery cursor', async () => {
    const first = await enqueue('event-1')
    const receipt = {
      ...publisher.getBindings(),
      sourceVersion: 1,
      projectionDigest: first.projectionDigest,
      projectionStatus: 'ready' as const,
    }
    for (const invalid of [
      { ...receipt, sourceVersion: 2 },
      { ...receipt, projectionDigest: '0'.repeat(64) },
      { ...receipt, audience: 'other-pds' },
      { ...receipt, issuer: 'did:web:other.example' },
      { ...receipt, space: `${space}-other` },
      { ...receipt, sourceUri: `${sourceUri}-other` },
      { ...receipt, projectionStatus: 'stale' },
    ]) {
      expect(await outbox.reconcileAccepted(invalid as typeof receipt)).toBe(
        false,
      )
    }
    expect(await stream()).toMatchObject({ acknowledgedVersion: 0 })
  })

  it('does not use an earlier receipt to clear a stop on a later expired head', async () => {
    const first = await enqueue('event-1')
    await enqueue('event-2')
    now = first.expiresAt
    expect(await outbox.claim()).toEqual({ status: 'recovery-required' })
    const receipt = {
      ...publisher.getBindings(),
      sourceVersion: 1,
      projectionDigest: first.projectionDigest,
      projectionStatus: 'ready' as const,
    }
    expect(await outbox.reconcileAccepted(receipt)).toBe(true)
    expect(await stream()).toMatchObject({
      acknowledgedVersion: 1,
      deliveryStatus: 'recovery-required',
    })
    expect(await outbox.reconcileAccepted(receipt)).toBe(true)
    expect(await outbox.claim()).toEqual({ status: 'recovery-required' })
  })

  it('fences an old worker and persists reconciled acknowledgements across restart', async () => {
    const first = await enqueue('event-1')
    const delivery = await outbox.claim()
    assert(delivery.status === 'claimed')
    const receipt = {
      ...publisher.getBindings(),
      sourceVersion: 1,
      projectionDigest: first.projectionDigest,
      projectionStatus: 'ready' as const,
    }
    expect(await outbox.reconcileAccepted(receipt)).toBe(true)
    expect(
      await outbox.acknowledge(1, first.projectionDigest, delivery.leaseToken),
    ).toBe(false)
    await db.destroy()
    db = connect()
    outbox = makeOutbox()
    expect(await outbox.claim()).toEqual({ status: 'empty' })
    expect(await enqueue('event-1')).toEqual(first)
  })

  it('rolls back reconciliation receipts if cursor persistence fails', async () => {
    const first = await enqueue('event-1')
    await db.schema
      .alterTable('para_policy_publication')
      .addCheckConstraint('reject_test_ack', sql`"acknowledgedVersion" = 0`)
      .execute()
    const receipt = {
      ...publisher.getBindings(),
      sourceVersion: 1,
      projectionDigest: first.projectionDigest,
      projectionStatus: 'ready' as const,
    }
    await expect(outbox.reconcileAccepted(receipt)).rejects.toThrow(
      'reject_test_ack',
    )
    expect(await stream()).toMatchObject({ acknowledgedVersion: 0 })
    expect(
      await db
        .selectFrom('para_policy_outbox')
        .select('acknowledgedAt')
        .executeTakeFirstOrThrow(),
    ).toEqual({ acknowledgedAt: null })
  })
})
