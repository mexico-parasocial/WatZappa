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
import { ParaPolicyCheckpoint } from '../../pds/src/actor-store/para-policy/checkpoint.js'
import { ParaPolicyIntake } from '../../pds/src/actor-store/para-policy/intake.js'
import { ParaPolicyReader } from '../../pds/src/actor-store/para-policy/reader.js'
import { ParaPolicyResolver } from '../../pds/src/actor-store/para-policy/resolver.js'
import { up as upOutbox } from '../src/data-plane/server/db/migrations/20260914T180000000Z-add-para-policy-outbox.js'
import {
  down as downCheckpointColumns,
  up as upCheckpointColumns,
} from '../src/data-plane/server/db/migrations/20260915T000000000Z-add-para-policy-checkpoint.js'
import type { PartialDB } from '../src/data-plane/server/db/tables/para-policy-outbox.js'
import {
  type ParaPolicyChange,
  ParaPolicyOutbox,
} from '../src/para-policy/outbox.js'
import { ParaPolicyPublisher } from '../src/para-policy/publisher.js'

const authority = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd'
const member = 'did:web:member.example'
const second = 'did:web:second.example'
const space = `at://${authority}/space/com.para.space.community/community-immutable-id`
const sourceUri = `at://${authority}/com.para.community.board/community-immutable-id`
const sourceCid = 'bafyreibjza57bggyhpyh4nnbkglkjetmv7nnnpb7rufpy5bky3pbmnh7am'
const collection = 'com.para.test.record'

describe('authenticated checkpoint recovery (Postgres publisher → SQLite PDS)', () => {
  let db: Kysely<PartialDB & { governance_marker: { id: number } }>
  let schema: string
  let publisher: ParaPolicyPublisher
  let outbox: ParaPolicyOutbox
  let actorDirectory: string
  let actorDb: ReturnType<typeof getDb>
  let reader: ParaPolicyReader
  let intake: ParaPolicyIntake
  let checkpoint: ParaPolicyCheckpoint
  let now: number
  let key: Awaited<ReturnType<typeof generateKeyPair>>
  const clock = () => new Date(now * 1_000)
  const config = {
    issuer: 'did:web:appview.para.example',
    audience: `${authority}#para_policy_intake`,
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
    schema = `policy_recovery_${randomBytes(8).toString('hex')}`
    db = connect()
    await db.schema.createSchema(schema).execute()
    await upOutbox(db as Kysely<unknown>)
    await upCheckpointColumns(db as Kysely<unknown>)
    await db.schema
      .createTable('governance_marker')
      .addColumn('id', 'integer', (col) => col.primaryKey())
      .execute()
    actorDirectory = await mkdtemp(path.join(tmpdir(), 'watzappa-recovery-'))
    actorDb = getDb(path.join(actorDirectory, 'actor.sqlite'))
    await getMigrator(actorDb).migrateToLatestOrThrow()
    await actorDb.ensureWal()
    now = Math.floor(Date.now() / 1_000)
    await actorDb.db
      .insertInto('space')
      .values({
        uri: space,
        authority,
        type: 'com.para.space.community',
        createdAt: clock().toISOString(),
        deletedAt: null,
      })
      .execute()
    publisher = await ParaPolicyPublisher.create(config, key.privateKey, clock)
    outbox = makeOutbox()
    reader = new ParaPolicyReader(actorDb)
    intake = new ParaPolicyIntake(
      actorDb,
      authority,
      {
        ...publisher.getBindings(),
        jwks: publisher.getJwks(),
        allowBootstrap: true,
        maxAssertionAgeSec: 300,
      },
      clock,
    )
    checkpoint = new ParaPolicyCheckpoint(
      actorDb,
      authority,
      {
        ...publisher.getBindings(),
        jwks: publisher.getJwks(),
        maxAssertionAgeSec: 300,
        challengeLifetimeSec: 300,
      },
      clock,
    )
  })

  afterEach(async () => {
    // @NOTE only this test's random schema is removed; shared test services are untouched.
    await db.schema.dropSchema(schema).cascade().execute()
    await db.destroy()
    await actorDb.db.destroy()
    await rm(actorDirectory, { recursive: true, force: true })
  })

  function change(overrides: Partial<ParaPolicyChange> = {}): ParaPolicyChange {
    return {
      kind: 'snapshot',
      sourceCid,
      members: [
        { did: member, membershipState: 'active', roles: ['moderator'] },
        { did: second, membershipState: 'active' },
      ],
      ...overrides,
    }
  }
  function makeOutbox(connection = db, signer = publisher) {
    return new ParaPolicyOutbox(
      connection.$pickTables<keyof PartialDB>(),
      signer,
      clock,
    )
  }
  function enqueue(eventId: string, input = change()) {
    return db
      .transaction()
      .execute((tx) => makeOutbox(tx).enqueue(eventId, input))
  }
  function prepareCheckpoint(
    eventId: string,
    challenge: Awaited<ReturnType<typeof checkpoint.issueChallenge>>,
    input: ParaPolicyChange,
  ) {
    assert(challenge)
    return db
      .transaction()
      .execute((tx) =>
        makeOutbox(tx).prepareCheckpoint(eventId, challenge, input),
      )
  }
  async function stream() {
    return db
      .selectFrom('para_policy_publication')
      .selectAll()
      .where('space', '=', space)
      .executeTakeFirstOrThrow()
  }
  async function outboxRow(sourceVersion: number) {
    return db
      .selectFrom('para_policy_outbox')
      .selectAll()
      .where('space', '=', space)
      .where('sourceVersion', '=', sourceVersion)
      .executeTakeFirstOrThrow()
  }
  async function decision(principal: string, policyEpoch: number) {
    const resolver = new ParaPolicyResolver(
      [
        {
          space,
          collection,
          action: 'create',
          clientIds: ['client'],
          roles: ['moderator'],
        },
      ],
      600_000,
    )
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
        policyEpoch,
        now: Math.max(Date.now(), clock().getTime()),
      },
      input,
    )
  }

  /** Deliver v1, lose the v2 revocation in transit, then arrive out of order as a verified gap. */
  async function loseRevocation() {
    const first = await enqueue('bootstrap')
    const delivery = await outbox.claim()
    assert(delivery.status === 'claimed')
    expect(delivery.update).toEqual(first)
    await intake.ingest(delivery.update.assertion)
    expect(
      await outbox.acknowledge(
        first.sourceVersion,
        first.projectionDigest,
        delivery.leaseToken,
      ),
    ).toBe(true)
    now += 5
    await enqueue(
      'remove-member',
      change({
        kind: 'patch',
        members: [{ did: member, membershipState: 'removed' }],
      }),
    )
    await enqueue(
      'touch-second',
      change({
        kind: 'patch',
        members: [
          { did: second, membershipState: 'active', roles: ['member'] },
        ],
      }),
    )
    // @NOTE the network reorders delivery: v3 arrives although v2 was lost.
    const arrived = await outboxRow(3)
    await expect(intake.ingest(arrived.assertion)).rejects.toMatchObject({
      error: 'PolicyProjectionOutOfOrder',
    })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'stale',
      sourceVersion: 1,
    })
    expect(await decision(member, 1)).toMatchObject({
      allowed: false,
      denial: 'projection-unavailable',
    })
  }

  it('recovers a lost revocation end to end without restoring revoked permissions', async () => {
    await loseRevocation()
    const challenge = await checkpoint.issueChallenge()
    assert(challenge)
    expect(challenge).toMatchObject({
      acceptedSourceVersion: 1,
      maxSourceVersion: 3,
      maxPolicyEpoch: 3,
      issuer: config.issuer,
      audience: config.audience,
      space,
      sourceUri,
      authority,
    })
    const prepared = await prepareCheckpoint(
      'recovery-1',
      challenge,
      change({
        members: [
          { did: second, membershipState: 'active', roles: ['moderator'] },
        ],
      }),
    )
    expect(prepared.sourceVersion).toBe(4)
    expect(prepared.policyEpoch).toBe(4)
    expect(await outbox.claim()).toEqual({ status: 'checkpoint-pending' })
    await expect(enqueue('blocked-while-pending')).rejects.toThrow(
      'pending checkpoint recovery',
    )
    const delivery = await outbox.claimCheckpoint()
    assert(delivery.status === 'claimed')
    expect(delivery.update).toEqual(prepared)
    expect(delivery.challengeId).toBe(challenge.id)
    const receipt = await checkpoint.install(delivery.update.assertion)
    // @NOTE publisher and PDS compute the projection digest independently.
    expect(receipt.projectionDigest).toBe(prepared.projectionDigest)
    expect(receipt).toMatchObject({
      sourceVersion: 4,
      policyEpoch: 4,
      challengeId: challenge.id,
      projectionStatus: 'ready',
    })
    expect(await decision(member, 4)).toMatchObject({
      allowed: false,
      denial: 'not-active-member',
    })
    expect(await decision(second, 4)).toMatchObject({
      allowed: true,
      policyEpoch: 4,
      roles: ['moderator'],
    })
    expect(
      await outbox.acknowledgeCheckpoint(
        4,
        prepared.projectionDigest,
        challenge.id,
        delivery.leaseToken,
      ),
    ).toBe(true)
    expect(await stream()).toMatchObject({
      deliveryStatus: 'ready',
      sourceVersion: 4,
      policyEpoch: 4,
      acknowledgedVersion: 4,
      projectionDigest: prepared.projectionDigest,
    })
    const superseded = await outboxRow(2)
    expect(superseded.supersededAt).not.toBeNull()
    expect(superseded.acknowledgedAt).toBeNull()
    expect((await outboxRow(3)).supersededAt).not.toBeNull()
    expect(await outbox.claim()).toEqual({ status: 'empty' })
    // Ordinary ordered delivery resumes from the installed checkpoint.
    now += 5
    const resumed = await enqueue(
      'post-recovery',
      change({
        kind: 'patch',
        members: [{ did: second, membershipState: 'blocked' }],
      }),
    )
    expect(resumed.sourceVersion).toBe(5)
    const next = await outbox.claim()
    assert(next.status === 'claimed')
    await intake.ingest(next.update.assertion)
    expect(
      await outbox.acknowledge(
        resumed.sourceVersion,
        resumed.projectionDigest,
        next.leaseToken,
      ),
    ).toBe(true)
    expect(await reader.getPolicyState(space)).toMatchObject({
      sourceVersion: 5,
      projectionStatus: 'ready',
    })
    expect(await decision(second, 5)).toMatchObject({
      allowed: false,
      denial: 'not-active-member',
    })
  })

  it('catches up a ready receiver whose undelivered head expired without a fault', async () => {
    const first = await enqueue('bootstrap')
    const delivery = await outbox.claim()
    assert(delivery.status === 'claimed')
    await intake.ingest(delivery.update.assertion)
    expect(
      await outbox.acknowledge(
        first.sourceVersion,
        first.projectionDigest,
        delivery.leaseToken,
      ),
    ).toBe(true)
    // @NOTE the removal is signed and queued, but its request is lost entirely.
    now += 5
    const lost = await enqueue(
      'remove-member',
      change({
        kind: 'patch',
        members: [{ did: member, membershipState: 'removed' }],
      }),
    )
    now = lost.expiresAt
    expect(await outbox.claim()).toEqual({ status: 'recovery-required' })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 1,
    })
    expect(await decision(member, 1)).toMatchObject({ allowed: true })
    // @NOTE an exact accepted receipt cannot clear an expired-head latch.
    const receipt = await intake.getAcceptedReceipt()
    assert(receipt)
    expect(await outbox.reconcileAccepted(receipt)).toBe(true)
    expect(await stream()).toMatchObject({
      deliveryStatus: 'recovery-required',
    })
    const challenge = await checkpoint.issueChallenge()
    assert(challenge)
    expect(challenge).toMatchObject({
      acceptedSourceVersion: 1,
      maxSourceVersion: 1,
      maxPolicyEpoch: 1,
    })
    const prepared = await prepareCheckpoint(
      'catch-up',
      challenge,
      change({
        members: [
          { did: second, membershipState: 'active', roles: ['moderator'] },
        ],
      }),
    )
    expect(prepared.sourceVersion).toBe(3)
    expect(prepared.policyEpoch).toBe(3)
    expect(await outbox.claim()).toEqual({ status: 'checkpoint-pending' })
    const catchUp = await outbox.claimCheckpoint()
    assert(catchUp.status === 'claimed')
    expect(catchUp.update).toEqual(prepared)
    const installed = await checkpoint.install(catchUp.update.assertion)
    expect(installed.projectionDigest).toBe(prepared.projectionDigest)
    expect(await decision(member, 3)).toMatchObject({
      allowed: false,
      denial: 'not-active-member',
    })
    expect(await decision(second, 3)).toMatchObject({ allowed: true })
    expect(
      await outbox.acknowledgeCheckpoint(
        prepared.sourceVersion,
        prepared.projectionDigest,
        challenge.id,
        catchUp.leaseToken,
      ),
    ).toBe(true)
    expect(await stream()).toMatchObject({
      deliveryStatus: 'ready',
      acknowledgedVersion: 3,
    })
    expect((await outboxRow(lost.sourceVersion)).supersededAt).not.toBeNull()
    now += 5
    const resumed = await enqueue(
      'post-catch-up',
      change({
        kind: 'patch',
        members: [{ did: second, membershipState: 'blocked' }],
      }),
    )
    expect(resumed.sourceVersion).toBe(4)
    const next = await outbox.claim()
    assert(next.status === 'claimed')
    await intake.ingest(next.update.assertion)
    expect(
      await outbox.acknowledge(
        resumed.sourceVersion,
        resumed.projectionDigest,
        next.leaseToken,
      ),
    ).toBe(true)
    expect(await reader.getPolicyState(space)).toMatchObject({
      sourceVersion: 4,
      projectionStatus: 'ready',
    })
  })

  it('reconciles a lost installation response and fences superseded workers', async () => {
    await loseRevocation()
    const challenge = await checkpoint.issueChallenge()
    assert(challenge)
    const prepared = await prepareCheckpoint(
      'recovery-1',
      challenge,
      change({ members: [] }),
    )
    const worker = await outbox.claimCheckpoint()
    assert(worker.status === 'claimed')
    const receipt = await checkpoint.install(worker.update.assertion)
    // @NOTE the response is lost; re-delivery is refused because the challenge is spent.
    await expect(
      checkpoint.install(worker.update.assertion),
    ).rejects.toMatchObject({ error: 'CheckpointChallengeConsumed' })
    now += 30
    const retry = await outbox.claimCheckpoint()
    assert(retry.status === 'claimed')
    expect(retry.update).toEqual(prepared)
    expect(
      await outbox.acknowledgeCheckpoint(
        4,
        prepared.projectionDigest,
        challenge.id,
        worker.leaseToken,
      ),
    ).toBe(false)
    const persisted = await checkpoint.getCheckpointReceipt()
    assert(persisted)
    expect(persisted).toEqual(receipt)
    expect(await outbox.reconcileCheckpoint(persisted)).toBe(true)
    expect(await stream()).toMatchObject({
      deliveryStatus: 'ready',
      acknowledgedVersion: 4,
    })
    expect(await outbox.reconcileCheckpoint(persisted)).toBe(true)
    expect(await outbox.claim()).toEqual({ status: 'empty' })
    // @NOTE a previous worker cannot revert the completed recovery.
    expect(
      await outbox.acknowledgeCheckpoint(
        4,
        prepared.projectionDigest,
        challenge.id,
        retry.leaseToken,
      ),
    ).toBe(false)
  })

  it('persists an unfinished recovery across publisher restart', async () => {
    await loseRevocation()
    const challenge = await checkpoint.issueChallenge()
    assert(challenge)
    const prepared = await prepareCheckpoint(
      'recovery-1',
      challenge,
      change({ members: [{ did: second, membershipState: 'active' }] }),
    )
    await db.destroy()
    db = connect()
    outbox = makeOutbox()
    expect(await outbox.claim()).toEqual({ status: 'checkpoint-pending' })
    const delivery = await outbox.claimCheckpoint()
    assert(delivery.status === 'claimed')
    expect(delivery.update).toEqual(prepared)
    const receipt = await checkpoint.install(delivery.update.assertion)
    expect(await outbox.reconcileCheckpoint(receipt)).toBe(true)
    expect(await stream()).toMatchObject({
      deliveryStatus: 'ready',
      acknowledgedVersion: 4,
    })
  })

  it('rejects a checkpoint whose floors advanced between issuance and installation', async () => {
    await loseRevocation()
    const challenge = await checkpoint.issueChallenge()
    assert(challenge)
    const prepared = await prepareCheckpoint(
      'recovery-1',
      challenge,
      change({ members: [] }),
    )
    // @NOTE distinct messages raise each floor independently: version via v5, epoch via epoch 7.
    const accepted = await reader.getPolicyState(space)
    const later = await publisher.prepare({
      kind: 'patch',
      sourceCid,
      sourceVersion: 5,
      policyEpoch: 7,
      previousDeltaDigest: accepted!.projectionDigest,
      members: [{ did: second, membershipState: 'active' }],
    })
    await expect(intake.ingest(later.assertion)).rejects.toMatchObject({
      error: 'PolicyProjectionRebootstrapRequired',
    })
    const fresh = await checkpoint.issueChallenge()
    expect(fresh).toMatchObject({ maxSourceVersion: 5, maxPolicyEpoch: 7 })
    const delivery = await outbox.claimCheckpoint()
    assert(delivery.status === 'claimed')
    await expect(
      checkpoint.install(delivery.update.assertion),
    ).rejects.toMatchObject({ error: 'CheckpointStateAdvanced' })
    expect(await stream()).toMatchObject({
      deliveryStatus: 'checkpoint-pending',
    })
    // @NOTE the superseded artifact must expire before a new one may be signed
    // above the new floors, and the new challenge is issued after that advance.
    now = prepared.expiresAt
    const renewed = await checkpoint.issueChallenge()
    expect(renewed).toMatchObject({ maxSourceVersion: 5, maxPolicyEpoch: 7 })
    const retry = await prepareCheckpoint(
      'recovery-2',
      renewed,
      change({
        members: [
          { did: second, membershipState: 'active', roles: ['moderator'] },
        ],
      }),
    )
    expect(retry.sourceVersion).toBe(6)
    expect(retry.policyEpoch).toBe(8)
    const superseded = await outboxRow(prepared.sourceVersion)
    expect(superseded.supersededAt).not.toBeNull()
    const next = await outbox.claimCheckpoint()
    assert(next.status === 'claimed')
    expect(next.update).toEqual(retry)
    const receipt = await checkpoint.install(next.update.assertion)
    expect(await outbox.reconcileCheckpoint(receipt)).toBe(true)
    expect(await stream()).toMatchObject({
      deliveryStatus: 'ready',
      acknowledgedVersion: 6,
    })
    expect(await decision(second, 8)).toMatchObject({ allowed: true })
  })

  it('reports checkpoint lease states and refuses unexpired duplicate preparations', async () => {
    await loseRevocation()
    expect(await outbox.claimCheckpoint()).toEqual({ status: 'unavailable' })
    const challenge = await checkpoint.issueChallenge()
    assert(challenge)
    const prepared = await prepareCheckpoint(
      'recovery-1',
      challenge,
      change({ members: [] }),
    )
    await expect(
      prepareCheckpoint('recovery-2', challenge, change({ members: [] })),
    ).rejects.toThrow('already pending')
    expect(
      await prepareCheckpoint('recovery-1', challenge, change({ members: [] })),
    ).toEqual(prepared)
    const competing = await Promise.all([
      outbox.claimCheckpoint(),
      makeOutbox().claimCheckpoint(),
    ])
    expect(competing.filter((item) => item.status === 'busy')).toHaveLength(1)
    now = prepared.expiresAt
    expect(await outbox.claimCheckpoint()).toEqual({ status: 'expired' })
  })

  it('rejects forged or mismatched checkpoint confirmations without moving the cursor', async () => {
    await loseRevocation()
    const challenge = await checkpoint.issueChallenge()
    assert(challenge)
    const prepared = await prepareCheckpoint(
      'recovery-1',
      challenge,
      change({ members: [] }),
    )
    const delivery = await outbox.claimCheckpoint()
    assert(delivery.status === 'claimed')
    await checkpoint.install(delivery.update.assertion)
    const receipt = await checkpoint.getCheckpointReceipt()
    assert(receipt)
    for (const invalid of [
      { ...receipt, sourceVersion: 5 },
      { ...receipt, projectionDigest: '0'.repeat(64) },
      { ...receipt, challengeId: 'forged' },
      { ...receipt, policyEpoch: 5 },
      { ...receipt, audience: 'other-pds' },
      { ...receipt, issuer: 'did:web:other.example' },
      { ...receipt, space: `${space}-other` },
      { ...receipt, sourceUri: `${sourceUri}-other` },
      { ...receipt, projectionStatus: 'stale' as never },
    ]) {
      expect(await outbox.reconcileCheckpoint(invalid)).toBe(false)
    }
    expect(
      await outbox.acknowledgeCheckpoint(
        prepared.sourceVersion,
        prepared.projectionDigest,
        challenge.id,
        'wrong-token',
      ),
    ).toBe(false)
    expect(await stream()).toMatchObject({
      deliveryStatus: 'checkpoint-pending',
      acknowledgedVersion: 1,
    })
    expect(await outbox.reconcileCheckpoint(receipt)).toBe(true)
  })

  it('validates recovery challenges and bounds checkpoint snapshot size', async () => {
    await loseRevocation()
    const challenge = await checkpoint.issueChallenge()
    assert(challenge)
    for (const invalid of [
      { ...challenge, audience: 'other-pds' },
      { ...challenge, issuer: 'did:web:other.example' },
      { ...challenge, space: `${space}-other` },
      { ...challenge, sourceUri: `${sourceUri}-other` },
      { ...challenge, maxSourceVersion: 0 },
      { ...challenge, maxPolicyEpoch: 0 },
      { ...challenge, secret: '' },
    ]) {
      await expect(
        db
          .transaction()
          .execute((tx) =>
            makeOutbox(tx).prepareCheckpoint('recovery-1', invalid, change()),
          ),
      ).rejects.toThrow('Invalid PARA policy recovery challenge')
    }
    const members = Array.from({ length: 200 }, (_, index) => ({
      did: `did:web:m-${index}.example`,
      membershipState: 'active' as const,
    }))
    await expect(
      prepareCheckpoint('oversized', challenge, change({ members })),
    ).rejects.toThrow('receiver limit')
    expect(await stream()).toMatchObject({ deliveryStatus: 'ready' })
  })

  it('requires the governance transaction for checkpoint preparation', async () => {
    await loseRevocation()
    const challenge = await checkpoint.issueChallenge()
    assert(challenge)
    await expect(
      outbox.prepareCheckpoint('recovery-1', challenge, change()),
    ).rejects.toThrow('governance transaction')
  })

  it('round-trips its migrations without altering ordinary delivery or governance rows', async () => {
    await loseRevocation()
    await sql`insert into ${sql.table(`${schema}.governance_marker`)} (id) values (1)`.execute(
      db,
    )
    // @NOTE pre-existing rows are backfilled as ordinary update artifacts.
    await downCheckpointColumns(db as Kysely<unknown>)
    await upCheckpointColumns(db as Kysely<unknown>)
    expect(
      (
        await sql`select * from ${sql.table(`${schema}.governance_marker`)}`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(1)
    expect((await outboxRow(2)).artifactKind).toBe('update')
    expect((await outboxRow(3)).artifactKind).toBe('update')
    const resumed = await outbox.claim()
    assert(resumed.status === 'claimed')
    expect(resumed.update.sourceVersion).toBe(2)
    // @NOTE a full recovery still works against the round-tripped schema.
    const challenge = await checkpoint.issueChallenge()
    assert(challenge)
    const prepared = await prepareCheckpoint(
      'recovery-1',
      challenge,
      change({ members: [{ did: second, membershipState: 'active' }] }),
    )
    expect(prepared.sourceVersion).toBe(4)
    const delivery = await outbox.claimCheckpoint()
    assert(delivery.status === 'claimed')
    await checkpoint.install(delivery.update.assertion)
    expect(
      await outbox.acknowledgeCheckpoint(
        prepared.sourceVersion,
        prepared.projectionDigest,
        challenge.id,
        delivery.leaseToken,
      ),
    ).toBe(true)
    expect(await stream()).toMatchObject({
      deliveryStatus: 'ready',
      acknowledgedVersion: 4,
    })
  })
})
