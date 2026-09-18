import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { sql } from 'kysely'
import {
  type ActorDb,
  getDb,
  getMigrator,
} from '../src/actor-store/db/index.js'
import {
  PARA_POLICY_CHECKPOINT_TYP,
  ParaPolicyCheckpoint,
  type ParaPolicyCheckpointChallenge,
  type ParaPolicyCheckpointConfig,
} from '../src/actor-store/para-policy/checkpoint.js'
import {
  PARA_POLICY_DELTA_TYP,
  ParaPolicyIntake,
  type ParaPolicyIntakeConfig,
} from '../src/actor-store/para-policy/intake.js'
import { ParaPolicyReader } from '../src/actor-store/para-policy/reader.js'
import { ParaPolicyResolver } from '../src/actor-store/para-policy/resolver.js'
import type { ParaPolicyProjectionDelta } from '../src/actor-store/para-policy/types.js'

const authority = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd'
const member = 'did:plc:7zp4oxrdragtjsm2j2vknwkz'
const second = 'did:web:second.example'
const space = `at://${authority}/space/com.para.space.community/community-immutable-id`
const issuer = 'did:web:appview.para.example'
const audience = `${authority}#para_policy_intake`
const sourceUri = `at://${authority}/com.para.community.board/community-immutable-id`
const sourceCid = 'bafyreibjza57bggyhpyh4nnbkglkjetmv7nnnpb7rufpy5bky3pbmnh7am'
const collection = 'com.para.test.record'
type WireDelta = Omit<ParaPolicyProjectionDelta, 'signedDelta'>
type WireCheckpoint = WireDelta & {
  challenge: { id: string; secret: string }
}

describe('authenticated PARA policy checkpoint recovery (draft)', () => {
  let directory: string
  let db: ActorDb
  let peer: ActorDb
  let reader: ParaPolicyReader
  let intake: ParaPolicyIntake
  let checkpoint: ParaPolicyCheckpoint
  let config: ParaPolicyIntakeConfig
  let now: number
  let key: Awaited<ReturnType<typeof generateKeyPair>>
  let otherKey: Awaited<ReturnType<typeof generateKeyPair>>
  const clock = () => new Date(now * 1_000)

  beforeAll(async () => {
    key = await generateKeyPair('EdDSA')
    otherKey = await generateKeyPair('EdDSA')
  })

  beforeEach(async () => {
    directory = await mkdtemp(
      path.join(tmpdir(), 'watzappa-policy-checkpoint-'),
    )
    db = getDb(path.join(directory, 'actor.sqlite'))
    await getMigrator(db).migrateToLatestOrThrow()
    await db.ensureWal()
    peer = getDb(path.join(directory, 'actor.sqlite'))
    now = Math.floor(Date.now() / 1_000)
    await db.db
      .insertInto('space')
      .values({
        uri: space,
        authority,
        type: 'com.para.space.community',
        createdAt: clock().toISOString(),
        deletedAt: null,
      })
      .execute()
    config = {
      issuer,
      audience,
      space,
      sourceUri,
      maxAssertionAgeSec: 300,
      allowBootstrap: true,
      jwks: {
        keys: [{ ...(await exportJWK(key.publicKey)), kid: 'publisher-1' }],
      },
    }
    intake = new ParaPolicyIntake(db, authority, config, clock)
    checkpoint = makeCheckpoint()
    reader = new ParaPolicyReader(db)
  })

  afterEach(async () => {
    await Promise.all([db.db.destroy(), peer.db.destroy()])
    await rm(directory, { recursive: true, force: true })
  })

  function makeCheckpoint(
    overrides: Partial<ParaPolicyCheckpointConfig> = {},
    connection: ActorDb = db,
  ) {
    return new ParaPolicyCheckpoint(
      connection,
      authority,
      {
        issuer,
        audience,
        space,
        sourceUri,
        jwks: config.jwks,
        maxAssertionAgeSec: 300,
        challengeLifetimeSec: 300,
        ...overrides,
      },
      clock,
    )
  }

  function delta(overrides: Partial<WireDelta> = {}): WireDelta {
    return {
      kind: 'snapshot',
      space,
      sourceUri,
      sourceCid,
      sourceIssuer: issuer,
      sourceVersion: 1,
      policyEpoch: 1,
      previousDeltaDigest: null,
      issuedAt: clock().toISOString(),
      members: [
        { did: member, membershipState: 'active', roles: ['moderator'] },
        { did: second, membershipState: 'active' },
      ],
      ...overrides,
    }
  }

  function sign(
    update = delta(),
    claims: Record<string, unknown> = {},
    header: Record<string, unknown> = {},
    privateKey = key.privateKey,
  ) {
    return new SignJWT({
      iss: issuer,
      aud: audience,
      iat: now,
      exp: now + 300,
      delta: update,
      ...claims,
    })
      .setProtectedHeader({
        alg: 'EdDSA',
        kid: 'publisher-1',
        typ: PARA_POLICY_DELTA_TYP,
        ...header,
      })
      .sign(privateKey)
  }

  async function next(overrides: Partial<WireDelta> = {}): Promise<WireDelta> {
    const previous = await reader.getPolicyState(space)
    return delta({
      kind: 'patch',
      sourceVersion: previous!.sourceVersion + 1,
      policyEpoch: previous!.policyEpoch + 1,
      previousDeltaDigest: previous!.projectionDigest,
      ...overrides,
    })
  }

  /** Bootstrap v1, then lose updates until two verified gaps latch stale at floors (8, 9). */
  async function goStale() {
    await intake.ingest(await sign())
    await expect(
      intake.ingest(
        await sign(await next({ sourceVersion: 4, policyEpoch: 9 })),
      ),
    ).rejects.toMatchObject({ error: 'PolicyProjectionOutOfOrder' })
    await expect(
      intake.ingest(
        await sign(await next({ sourceVersion: 8, policyEpoch: 4 })),
      ),
    ).rejects.toMatchObject({ error: 'PolicyProjectionRebootstrapRequired' })
  }

  function checkpointPayload(
    challenge: ParaPolicyCheckpointChallenge,
    overrides: Partial<WireCheckpoint> = {},
  ): WireCheckpoint {
    return {
      challenge: { id: challenge.id, secret: challenge.secret },
      kind: 'snapshot',
      space,
      sourceUri,
      sourceCid,
      sourceIssuer: issuer,
      sourceVersion: challenge.maxSourceVersion + 1,
      policyEpoch: challenge.maxPolicyEpoch + 1,
      previousDeltaDigest: challenge.acceptedProjectionDigest,
      issuedAt: clock().toISOString(),
      members: [
        { did: second, membershipState: 'active', roles: ['moderator'] },
      ],
      ...overrides,
    }
  }

  function signCheckpoint(
    challenge: ParaPolicyCheckpointChallenge,
    overrides: Partial<WireCheckpoint> = {},
    claims: Record<string, unknown> = {},
    header: Record<string, unknown> = {},
    privateKey = key.privateKey,
  ) {
    return new SignJWT({
      iss: issuer,
      aud: audience,
      iat: now,
      exp: now + 300,
      checkpoint: checkpointPayload(challenge, overrides),
      ...claims,
    })
      .setProtectedHeader({
        alg: 'EdDSA',
        kid: 'publisher-1',
        typ: PARA_POLICY_CHECKPOINT_TYP,
        ...header,
      })
      .sign(privateKey)
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
    const input = await db.transaction((tx) =>
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

  async function challengeRow(id: string) {
    return db.db
      .selectFrom('para_space_policy_challenge')
      .selectAll()
      .where('space', '=', space)
      .where('challengeId', '=', id)
      .executeTakeFirst()
  }

  it('issues a challenge for a live, source-bound stale or lagging projection only', async () => {
    expect(await checkpoint.issueChallenge()).toBeNull()
    await intake.ingest(await sign())
    // @NOTE a ready-but-lagged projection may request a catch-up challenge;
    // its floors come from the accepted state while no fault exists.
    const catchUp = await checkpoint.issueChallenge()
    expect(catchUp).toMatchObject({
      issuer,
      audience,
      authority,
      space,
      sourceUri,
      acceptedSourceVersion: 1,
      maxSourceVersion: 1,
      maxPolicyEpoch: 1,
    })
    await goStale()
    const challenge = await checkpoint.issueChallenge()
    expect(challenge).toMatchObject({
      issuer,
      audience,
      authority,
      space,
      sourceUri,
      acceptedSourceVersion: 1,
      maxSourceVersion: 8,
      maxPolicyEpoch: 9,
    })
    const state = await reader.getPolicyState(space)
    expect(challenge!.acceptedProjectionDigest).toBe(state!.projectionDigest)
    expect(challenge!.secret.length).toBeGreaterThanOrEqual(32)
    const wrongSource = makeCheckpoint({ sourceUri: `${sourceUri}-other` })
    expect(await wrongSource.issueChallenge()).toBeNull()
    await db.db
      .updateTable('space')
      .set({ deletedAt: clock().toISOString() })
      .where('uri', '=', space)
      .execute()
    expect(await checkpoint.issueChallenge()).toBeNull()
  })

  it('bounds outstanding challenges and cleans expired ones', async () => {
    await goStale()
    for (let index = 0; index < 4; index++) {
      expect(await checkpoint.issueChallenge()).not.toBeNull()
    }
    await expect(checkpoint.issueChallenge()).rejects.toMatchObject({
      error: 'TooManyPolicyChallenges',
    })
    now += 301
    expect(await checkpoint.issueChallenge()).not.toBeNull()
    const remaining = await db.db
      .selectFrom('para_space_policy_challenge')
      .selectAll()
      .execute()
    expect(remaining).toHaveLength(1)
    now += 301
    expect(await checkpoint.cleanupExpiredChallenges()).toBe(1)
    expect(
      await db.db
        .selectFrom('para_space_policy_challenge')
        .selectAll()
        .execute(),
    ).toHaveLength(0)
  })

  it('installs a verified checkpoint that denies the revoked member and restores only effective permissions', async () => {
    await goStale()
    expect(await decision(member, 1)).toMatchObject({
      allowed: false,
      denial: 'projection-unavailable',
    })
    const challenge = (await checkpoint.issueChallenge())!
    const receipt = await checkpoint.install(await signCheckpoint(challenge))
    expect(receipt).toMatchObject({
      issuer,
      audience,
      space,
      sourceUri,
      sourceVersion: 9,
      policyEpoch: 10,
      challengeId: challenge.id,
      projectionStatus: 'ready',
    })
    const state = await reader.getPolicyState(space)
    expect(state).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 9,
      policyEpoch: 10,
      projectionDigest: receipt.projectionDigest,
      signedDelta: await signCheckpoint(challenge),
    })
    expect(await reader.getPolicyMember(space, member)).toMatchObject({
      membershipState: 'removed',
      roles: [],
    })
    expect(await decision(member, 10)).toMatchObject({
      allowed: false,
      denial: 'not-active-member',
    })
    expect(await decision(second, 10)).toMatchObject({
      allowed: true,
      policyEpoch: 10,
      roles: ['moderator'],
    })
    expect(await reader.getPolicyFault(space)).toMatchObject({
      maxSourceVersion: 8,
      maxPolicyEpoch: 9,
    })
    expect(
      await (challengeRow(challenge.id) as Promise<{
        consumedAt: string | null
      }>),
    ).toMatchObject({ consumedAt: expect.any(String) })
  })

  it('continues the ordinary chain from an installed checkpoint', async () => {
    await goStale()
    const challenge = (await checkpoint.issueChallenge())!
    await checkpoint.install(await signCheckpoint(challenge))
    const receipt = await checkpoint.getCheckpointReceipt()
    expect(receipt).toMatchObject({
      sourceVersion: 9,
      challengeId: challenge.id,
    })
    await intake.ingest(
      await sign(
        await next({
          members: [{ did: second, membershipState: 'blocked' }],
        }),
      ),
    )
    expect(await reader.getPolicyState(space)).toMatchObject({
      sourceVersion: 10,
      projectionStatus: 'ready',
    })
    expect(await decision(second, 11)).toMatchObject({
      allowed: false,
      denial: 'not-active-member',
    })
    expect(await checkpoint.getCheckpointReceipt()).toBeNull()
  })

  it('catches up a ready projection that fell behind without a verified fault', async () => {
    await intake.ingest(await sign())
    const challenge = (await checkpoint.issueChallenge())!
    expect(challenge).toMatchObject({
      acceptedSourceVersion: 1,
      maxSourceVersion: 1,
      maxPolicyEpoch: 1,
    })
    const receipt = await checkpoint.install(await signCheckpoint(challenge))
    expect(receipt).toMatchObject({ sourceVersion: 2, policyEpoch: 2 })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 2,
      policyEpoch: 2,
    })
    expect(await reader.getPolicyMember(space, member)).toMatchObject({
      membershipState: 'removed',
    })
    await intake.ingest(
      await sign(
        await next({
          members: [{ did: second, membershipState: 'blocked' }],
        }),
      ),
    )
    expect(await reader.getPolicyState(space)).toMatchObject({
      sourceVersion: 3,
      projectionStatus: 'ready',
    })
  })

  it('invalidates a catch-up challenge when an ordinary delta moves the ready projection', async () => {
    await intake.ingest(await sign())
    const challenge = (await checkpoint.issueChallenge())!
    await intake.ingest(
      await sign(
        await next({
          members: [{ did: second, membershipState: 'blocked' }],
        }),
      ),
    )
    await expect(
      checkpoint.install(await signCheckpoint(challenge)),
    ).rejects.toMatchObject({ error: 'CheckpointStateAdvanced' })
    expect(await challengeRow(challenge.id)).toMatchObject({
      consumedAt: null,
    })
    expect(await reader.getPolicyState(space)).toMatchObject({
      sourceVersion: 2,
      projectionStatus: 'ready',
    })
  })

  it.each([
    ['forged signature', 'wrong-key'],
    ['delta type', 'delta-typ'],
    ['unknown key', 'unknown-kid'],
    ['issuer', 'wrong-iss'],
    ['audience', 'wrong-aud'],
    ['future issuance', 'future-iat'],
    ['source issuer', 'wrong-source-issuer'],
    ['source URI', 'wrong-source-uri'],
    ['space', 'wrong-space'],
  ])(
    'rejects a checkpoint with a wrong %s without consuming its challenge',
    async (_name, mode) => {
      const payload =
        {
          'wrong-source-issuer': { sourceIssuer: 'did:web:other.example' },
          'wrong-source-uri': { sourceUri: `${sourceUri}-other` },
          'wrong-space': { space: `${space}-other` },
        }[mode] ?? {}
      const claims =
        {
          'wrong-iss': { iss: 'did:web:untrusted.example' },
          'wrong-aud': { aud: 'another-pds' },
          'future-iat': { iat: now + 1, exp: now + 301 },
        }[mode] ?? {}
      const header =
        {
          'delta-typ': { typ: PARA_POLICY_DELTA_TYP },
          'unknown-kid': { kid: 'unknown' },
        }[mode] ?? {}
      const privateKey =
        mode === 'wrong-key' ? otherKey.privateKey : key.privateKey
      await goStale()
      const challenge = (await checkpoint.issueChallenge())!
      await expect(
        checkpoint.install(
          await signCheckpoint(
            challenge,
            payload as Partial<WireCheckpoint>,
            claims,
            header,
            privateKey,
          ),
        ),
      ).rejects.toMatchObject({ error: 'InvalidPolicyAssertion' })
      expect(
        await (challengeRow(challenge.id) as Promise<{
          consumedAt: string | null
        }>),
      ).toMatchObject({ consumedAt: null })
      expect(await reader.getPolicyState(space)).toMatchObject({
        projectionStatus: 'stale',
        sourceVersion: 1,
      })
      // @NOTE the same challenge still authorizes a valid checkpoint afterwards.
      await checkpoint.install(await signCheckpoint(challenge))
      expect(await reader.getPolicyState(space)).toMatchObject({
        projectionStatus: 'ready',
        sourceVersion: 9,
      })
    },
  )

  it('rejects malformed or patch checkpoints as invalid projections', async () => {
    await goStale()
    const challenge = (await checkpoint.issueChallenge())!
    const duplicateMembers = [
      { did: second, membershipState: 'active' as const },
      { did: second, membershipState: 'removed' as const },
    ]
    await expect(
      checkpoint.install(
        await signCheckpoint(challenge, { members: duplicateMembers }),
      ),
    ).rejects.toMatchObject({ error: 'InvalidPolicyProjection' })
    await expect(
      checkpoint.install(
        await signCheckpoint(challenge, { kind: 'patch' } as never),
      ),
    ).rejects.toMatchObject({ error: 'InvalidPolicyProjection' })
    await expect(
      checkpoint.install(
        await new SignJWT({
          iss: issuer,
          aud: audience,
          iat: now,
          exp: now + 300,
          checkpoint: {
            ...checkpointPayload(challenge),
            signedDelta: 'substituted',
          },
        })
          .setProtectedHeader({
            alg: 'EdDSA',
            kid: 'publisher-1',
            typ: PARA_POLICY_CHECKPOINT_TYP,
          })
          .sign(key.privateKey),
      ),
    ).rejects.toMatchObject({ error: 'InvalidPolicyAssertion' })
    await expect(checkpoint.install('x'.repeat(16_385))).rejects.toMatchObject({
      error: 'InvalidPolicyAssertion',
    })
    expect(await challengeRow(challenge.id)).toMatchObject({ consumedAt: null })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'stale',
    })
  })

  it.each([
    ['version floor', { sourceVersion: 8 }],
    ['epoch floor', { policyEpoch: 9 }],
    ['broken chain', { previousDeltaDigest: '0'.repeat(64) }],
  ])(
    'rejects a checkpoint that does not exceed the %s',
    async (_name, change) => {
      await goStale()
      const challenge = (await checkpoint.issueChallenge())!
      await expect(
        checkpoint.install(await signCheckpoint(challenge, change)),
      ).rejects.toMatchObject({ error: 'InvalidCheckpointProjection' })
      expect(await challengeRow(challenge.id)).toMatchObject({
        consumedAt: null,
      })
      expect(await reader.getPolicyState(space)).toMatchObject({
        projectionStatus: 'stale',
        sourceVersion: 1,
      })
    },
  )

  it('rejects an expired challenge without touching policy', async () => {
    await goStale()
    const challenge = (await checkpoint.issueChallenge())!
    now += 301
    await expect(
      checkpoint.install(await signCheckpoint(challenge)),
    ).rejects.toMatchObject({ error: 'CheckpointChallengeExpired' })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'stale',
    })
  })

  it('refuses to reuse a consumed challenge and reports the persisted receipt instead', async () => {
    await goStale()
    const challenge = (await checkpoint.issueChallenge())!
    const assertion = await signCheckpoint(challenge)
    const receipt = await checkpoint.install(assertion)
    await expect(checkpoint.install(assertion)).rejects.toMatchObject({
      error: 'CheckpointChallengeConsumed',
    })
    expect(await checkpoint.getCheckpointReceipt()).toEqual(receipt)
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 9,
    })
  })

  it('rejects a challenge whose state or floors advanced since issuance', async () => {
    await goStale()
    const challenge = (await checkpoint.issueChallenge())!
    await expect(
      intake.ingest(
        await sign(await next({ sourceVersion: 12, policyEpoch: 12 })),
      ),
    ).rejects.toMatchObject({ error: 'PolicyProjectionRebootstrapRequired' })
    await expect(
      checkpoint.install(await signCheckpoint(challenge)),
    ).rejects.toMatchObject({ error: 'CheckpointStateAdvanced' })
    expect(await challengeRow(challenge.id)).toMatchObject({ consumedAt: null })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'stale',
      sourceVersion: 1,
    })
    const fresh = (await checkpoint.issueChallenge())!
    expect(fresh).toMatchObject({ maxSourceVersion: 12, maxPolicyEpoch: 12 })
    await checkpoint.install(await signCheckpoint(fresh))
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 13,
    })
  })

  it('rolls back challenge consumption when the installation write fails', async () => {
    await goStale()
    const challenge = (await checkpoint.issueChallenge())!
    await sql`create trigger reject_policy_checkpoint before insert on para_space_policy_checkpoint
      begin select raise(abort, 'forced checkpoint failure'); end`.execute(
      db.db,
    )
    await expect(
      checkpoint.install(await signCheckpoint(challenge)),
    ).rejects.toMatchObject({ message: 'forced checkpoint failure' })
    expect(await challengeRow(challenge.id)).toMatchObject({ consumedAt: null })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'stale',
    })
    await sql`drop trigger reject_policy_checkpoint`.execute(db.db)
    await checkpoint.install(await signCheckpoint(challenge))
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 9,
    })
  })

  it('serializes concurrent installations to a single winner', async () => {
    await goStale()
    const challenge = (await checkpoint.issueChallenge())!
    const assertion = await signCheckpoint(challenge)
    const peerCheckpoint = makeCheckpoint({}, peer)
    const outcomes = await Promise.allSettled([
      checkpoint.install(assertion),
      peerCheckpoint.install(assertion),
    ])
    const succeeded = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled',
    )
    expect(succeeded).toHaveLength(1)
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 9,
    })
    expect(
      await db.db
        .selectFrom('para_space_policy_delta')
        .selectAll()
        .where('space', '=', space)
        .where('sourceVersion', '=', 9)
        .execute(),
    ).toHaveLength(1)
  })

  it('round-trips the checkpoint migration without resetting the accepted policy', async () => {
    await goStale()
    await checkpoint.issueChallenge()
    const state = await reader.getPolicyState(space)
    await getMigrator(db).migrateToOrThrow('901-para-policy-fault')
    await getMigrator(db).migrateToLatestOrThrow()
    expect(await reader.getPolicyState(space)).toEqual(state)
    expect(
      await db.db
        .selectFrom('para_space_policy_challenge')
        .selectAll()
        .execute(),
    ).toHaveLength(0)
    const challenge = await checkpoint.issueChallenge()
    expect(challenge).toMatchObject({ maxSourceVersion: 8, maxPolicyEpoch: 9 })
  })

  it('validates trust and lifetime configuration like the intake', async () => {
    expect(() => makeCheckpoint({ challengeLifetimeSec: 0 })).toThrow()
    expect(() => makeCheckpoint({ challengeLifetimeSec: 3_601 })).toThrow()
    expect(() =>
      makeCheckpoint({
        jwks: { keys: [...config.jwks.keys, ...config.jwks.keys] },
      }),
    ).toThrow()
    expect(() =>
      makeCheckpoint({
        jwks: {
          keys: [{ ...config.jwks.keys[0], d: 'private-material' }],
        },
      }),
    ).toThrow()
    expect(() => makeCheckpoint({ maxAssertionAgeSec: 0 })).toThrow()
  })
})
