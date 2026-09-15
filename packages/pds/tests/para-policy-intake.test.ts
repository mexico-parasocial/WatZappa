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
  PARA_POLICY_DELTA_TYP,
  ParaPolicyIntake,
  type ParaPolicyIntakeConfig,
} from '../src/actor-store/para-policy/intake.js'
import { ParaPolicyReader } from '../src/actor-store/para-policy/reader.js'
import { ParaPolicyResolver } from '../src/actor-store/para-policy/resolver.js'
import type { ParaPolicyProjectionDelta } from '../src/actor-store/para-policy/types.js'

const authority = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd'
const member = 'did:plc:7zp4oxrdragtjsm2j2vknwkz'
const space = `at://${authority}/space/com.para.space.community/community-immutable-id`
const issuer = 'did:web:appview.para.example'
const audience = `${authority}#para_policy_intake`
const sourceUri = `at://${authority}/com.para.community.board/community-immutable-id`
const sourceCid = 'bafyreibjza57bggyhpyh4nnbkglkjetmv7nnnpb7rufpy5bky3pbmnh7am'
type WireDelta = Omit<ParaPolicyProjectionDelta, 'signedDelta'>

describe('signed PARA policy intake (draft)', () => {
  let directory: string
  let db: ActorDb
  let peer: ActorDb
  let reader: ParaPolicyReader
  let intake: ParaPolicyIntake
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
    directory = await mkdtemp(path.join(tmpdir(), 'watzappa-policy-intake-'))
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
    reader = new ParaPolicyReader(db)
  })

  afterEach(async () => {
    await Promise.all([db.db.destroy(), peer.db.destroy()])
    await rm(directory, { recursive: true, force: true })
  })

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

  it('applies a verified bootstrap and chained revocation with exact signed receipts', async () => {
    const first = await sign()
    await intake.ingest(first)
    expect(await reader.getPolicyState(space)).toMatchObject({
      sourceVersion: 1,
      projectionStatus: 'ready',
      signedDelta: first,
    })
    expect(await reader.getPolicyMember(space, member)).toMatchObject({
      membershipState: 'active',
      roles: ['moderator'],
    })
    const second = await sign(
      await next({
        members: [{ did: member, membershipState: 'removed', roles: [] }],
      }),
    )
    await intake.ingest(second)
    expect(await reader.getPolicyMember(space, member)).toMatchObject({
      membershipState: 'removed',
      roles: [],
    })
    expect(await reader.getPolicyDelta(space, 2)).toMatchObject({
      signedDelta: second,
      policyEpoch: 2,
    })
  })

  it('requires explicit bootstrap authorization even for a trusted signature', async () => {
    const restricted = new ParaPolicyIntake(
      db,
      authority,
      { ...config, allowBootstrap: false },
      clock,
    )
    await expect(restricted.ingest(await sign())).rejects.toMatchObject({
      error: 'PolicyProjectionRebootstrapRequired',
    })
    expect(await reader.getPolicyState(space)).toBeNull()
  })

  it.each([
    ['issuer', { iss: 'did:web:untrusted.example' }],
    ['audience', { aud: 'another-pds' }],
    ['multiple audiences', { aud: [audience, 'another-pds'] }],
    ['expired', { exp: 1 }],
    ['missing expiration', { exp: undefined }],
    ['unexpected claims', { extra: 'unexpected' }],
  ])('rejects %s before bootstrapping', async (_name, claims) => {
    await expect(
      intake.ingest(await sign(delta(), claims)),
    ).rejects.toMatchObject({ error: 'InvalidPolicyAssertion' })
    expect(await reader.getPolicyState(space)).toBeNull()
  })

  it.each([
    ['type', { typ: 'para-policy-delta+jwt' }],
    ['unknown key', { kid: 'unknown' }],
    ['remote JWKS', { jku: 'https://attacker.example/jwks' }],
  ])(
    'rejects a %s header without accepting its payload',
    async (_name, header) => {
      await expect(
        intake.ingest(await sign(delta(), {}, header)),
      ).rejects.toMatchObject({ error: 'InvalidPolicyAssertion' })
      expect(await reader.getPolicyState(space)).toBeNull()
    },
  )

  it.each([
    ['source issuer', { sourceIssuer: 'did:web:other.example' }],
    ['source URI', { sourceUri: `${sourceUri}-other` }],
    ['space', { space: `${space}-other` }],
    ['issuance time', { issuedAt: '2020-01-01T00:00:00.000Z' }],
  ])('rejects a signed but unbound %s', async (_name, change) => {
    await expect(
      intake.ingest(await sign(delta(change))),
    ).rejects.toMatchObject({ error: 'InvalidPolicyAssertion' })
    expect(await reader.getPolicyState(space)).toBeNull()
  })

  it('rejects malformed signed policy payloads without changing ready state', async () => {
    await intake.ingest(await sign())
    const previous = await reader.getPolicyState(space)
    const invalid = await next({
      members: [
        { did: member, membershipState: 'active' },
        { did: member, membershipState: 'removed' },
      ],
    })
    await expect(intake.ingest(await sign(invalid))).rejects.toMatchObject({
      error: 'InvalidPolicyProjection',
    })
    expect(await reader.getPolicyState(space)).toEqual(previous)
    await expect(
      intake.ingest(
        await sign(delta(), {
          delta: { ...delta(), signedDelta: 'substituted' },
        }),
      ),
    ).rejects.toMatchObject({ error: 'InvalidPolicyAssertion' })
  })

  it('rejects excessive lifetimes, future issuance and oversized input', async () => {
    await expect(
      intake.ingest(await sign(delta(), { exp: now + 301 })),
    ).rejects.toMatchObject({ error: 'InvalidPolicyAssertion' })
    await expect(
      intake.ingest(
        await sign(
          delta({ issuedAt: new Date((now + 1) * 1_000).toISOString() }),
          { iat: now + 1 },
        ),
      ),
    ).rejects.toMatchObject({ error: 'InvalidPolicyAssertion' })
    await expect(intake.ingest('x'.repeat(16_385))).rejects.toMatchObject({
      error: 'InvalidPolicyAssertion',
    })
    expect(await reader.getPolicyState(space)).toBeNull()
  })

  it('does not invalidate ready state when a forged message claims a gap', async () => {
    await intake.ingest(await sign())
    const previous = await reader.getPolicyState(space)
    const forged = await sign(
      await next({ sourceVersion: 9 }),
      {},
      {},
      otherKey.privateKey,
    )
    await expect(intake.ingest(forged)).rejects.toMatchObject({
      error: 'InvalidPolicyAssertion',
    })
    expect(await reader.getPolicyState(space)).toEqual(previous)
  })

  it('commits a verified gap as stale, denies authorization, and latches across restart', async () => {
    await intake.ingest(await sign())
    const previous = await reader.getPolicyState(space)
    await expect(
      intake.ingest(
        await sign(await next({ sourceVersion: 4, policyEpoch: 4 })),
      ),
    ).rejects.toMatchObject({ error: 'PolicyProjectionOutOfOrder' })
    expect(await reader.getPolicyState(space)).toEqual({
      ...previous,
      projectionStatus: 'stale',
    })
    expect(await reader.getPolicyDelta(space, 4)).toBeNull()
    const resolver = new ParaPolicyResolver(
      [
        {
          space,
          collection: 'com.para.test.record',
          action: 'create',
          clientIds: ['client'],
          roles: ['moderator'],
        },
      ],
      600_000,
    )
    const input = await db.transaction((tx) =>
      new ParaPolicyReader(tx).getPolicyInput(space, member),
    )
    expect(
      resolver.resolve(
        {
          space,
          principalDid: member,
          collection: 'com.para.test.record',
          action: 'create',
          clientId: 'client',
          policyEpoch: 1,
          now: Date.now(),
        },
        input,
      ),
    ).toMatchObject({ allowed: false, denial: 'projection-unavailable' })
    await db.db.destroy()
    db = getDb(path.join(directory, 'actor.sqlite'))
    intake = new ParaPolicyIntake(db, authority, config, clock)
    reader = new ParaPolicyReader(db)
    await expect(
      intake.ingest(await sign(await next({ kind: 'snapshot' }))),
    ).rejects.toMatchObject({ error: 'PolicyProjectionRebootstrapRequired' })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'stale',
      sourceVersion: 1,
    })
  })

  it.each([
    [
      'broken chain',
      { previousDeltaDigest: '0'.repeat(64) },
      'PolicyProjectionChainMismatch',
    ],
    ['epoch rollback', { policyEpoch: 1 }, 'PolicyProjectionEpochRollback'],
    [
      'current-version equivocation',
      { sourceVersion: 1, members: [] },
      'PolicyProjectionOutOfOrder',
    ],
  ])(
    'invalidates a verified %s without mutating members or receipts',
    async (_name, change, error) => {
      await intake.ingest(await sign())
      const before = await reader.getPolicyMember(space, member)
      await expect(
        intake.ingest(await sign(await next({ kind: 'snapshot', ...change }))),
      ).rejects.toMatchObject({ error })
      expect(await reader.getPolicyState(space)).toMatchObject({
        projectionStatus: 'stale',
        sourceVersion: 1,
      })
      expect(await reader.getPolicyMember(space, member)).toEqual(before)
      expect(await reader.getPolicyDelta(space, 2)).toBeNull()
    },
  )

  it('does not refresh exact retries or invalidate state for older replays', async () => {
    const first = await sign()
    await intake.ingest(first)
    const initial = await reader.getPolicyState(space)
    now += 1
    await intake.ingest(first)
    expect(await reader.getPolicyState(space)).toEqual(initial)
    await intake.ingest(await sign(await next()))
    const current = await reader.getPolicyState(space)
    await expect(intake.ingest(first)).rejects.toMatchObject({
      error: 'PolicyProjectionOutOfOrder',
    })
    expect(await reader.getPolicyState(space)).toEqual(current)
  })

  it('never restores ready state when an ordered update races with a verified gap', async () => {
    await intake.ingest(await sign())
    const ordered = await sign(await next())
    const gap = await sign(await next({ sourceVersion: 4, policyEpoch: 4 }))
    const peerIntake = new ParaPolicyIntake(peer, authority, config, clock)
    const results = await Promise.allSettled([
      intake.ingest(ordered),
      peerIntake.ingest(gap),
    ])
    expect(results[1].status).toBe('rejected')
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'stale',
    })
    expect(await reader.getPolicyDelta(space, 4)).toBeNull()
  })

  it('rolls back a projection when member persistence fails', async () => {
    const token = await sign()
    await sql`create trigger reject_policy_member before insert on para_space_policy_member
      begin select raise(abort, 'forced member failure'); end`.execute(db.db)
    await expect(intake.ingest(token)).rejects.toMatchObject({
      message: 'forced member failure',
    })
    expect(await reader.getPolicyState(space)).toBeNull()
    expect(await reader.getPolicyDelta(space, 1)).toBeNull()
    await sql`drop trigger reject_policy_member`.execute(db.db)
    await intake.ingest(token)
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
    })
  })

  it('retains independent verified version and epoch floors while stale', async () => {
    await intake.ingest(await sign())
    const epochEvidence = await sign(
      await next({ sourceVersion: 4, policyEpoch: 9 }),
    )
    await expect(intake.ingest(epochEvidence)).rejects.toMatchObject({
      error: 'PolicyProjectionOutOfOrder',
    })
    const versionEvidence = await sign(
      await next({ sourceVersion: 8, policyEpoch: 4 }),
    )
    await expect(intake.ingest(versionEvidence)).rejects.toMatchObject({
      error: 'PolicyProjectionRebootstrapRequired',
    })
    const fault = await reader.getPolicyFault(space)
    expect(fault).toMatchObject({
      maxSourceVersion: 8,
      maxPolicyEpoch: 9,
      versionEvidence,
      epochEvidence,
    })
    await expect(intake.ingest(epochEvidence)).rejects.toMatchObject({
      error: 'PolicyProjectionRebootstrapRequired',
    })
    expect(await reader.getPolicyFault(space)).toEqual(fault)
    await expect(
      intake.ingest(
        await sign(
          await next({ sourceVersion: 99, policyEpoch: 99 }),
          {},
          {},
          otherKey.privateKey,
        ),
      ),
    ).rejects.toMatchObject({ error: 'InvalidPolicyAssertion' })
    expect(await reader.getPolicyFault(space)).toEqual(fault)
    await db.db.destroy()
    db = getDb(path.join(directory, 'actor.sqlite'))
    reader = new ParaPolicyReader(db)
    expect(await reader.getPolicyFault(space)).toEqual(fault)
    expect(await reader.getPolicyState(space)).toMatchObject({
      sourceVersion: 1,
      policyEpoch: 1,
      projectionStatus: 'stale',
    })
  })

  it('merges concurrent fault high-water marks without accepting either update', async () => {
    await intake.ingest(await sign())
    const first = await sign(await next({ sourceVersion: 4, policyEpoch: 9 }))
    const second = await sign(await next({ sourceVersion: 8, policyEpoch: 4 }))
    const peerIntake = new ParaPolicyIntake(peer, authority, config, clock)
    const outcomes = await Promise.allSettled([
      intake.ingest(first),
      peerIntake.ingest(second),
    ])
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'rejected',
      'rejected',
    ])
    expect(await reader.getPolicyFault(space)).toMatchObject({
      maxSourceVersion: 8,
      maxPolicyEpoch: 9,
    })
    expect(await reader.getPolicyDelta(space, 8)).toBeNull()
  })

  it('records the fault and stale latch atomically', async () => {
    await intake.ingest(await sign())
    const gap = await sign(await next({ sourceVersion: 4, policyEpoch: 4 }))
    await sql`create trigger reject_policy_fault before insert on para_space_policy_fault
      begin select raise(abort, 'forced fault failure'); end`.execute(db.db)
    await expect(intake.ingest(gap)).rejects.toMatchObject({
      message: 'forced fault failure',
    })
    expect(await reader.getPolicyFault(space)).toBeNull()
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
    })
    await sql`drop trigger reject_policy_fault`.execute(db.db)
    await expect(intake.ingest(gap)).rejects.toMatchObject({
      error: 'PolicyProjectionOutOfOrder',
    })
    expect(await reader.getPolicyFault(space)).toMatchObject({
      maxSourceVersion: 4,
    })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'stale',
    })
  })

  it('returns exact receipts only for active, ready, source-bound projections', async () => {
    expect(await intake.getAcceptedReceipt()).toBeNull()
    await intake.ingest(await sign())
    const state = await reader.getPolicyState(space)
    expect(await intake.getAcceptedReceipt()).toEqual({
      issuer,
      audience,
      space,
      sourceUri,
      sourceVersion: 1,
      projectionDigest: state!.projectionDigest,
      projectionStatus: 'ready',
    })
    const wrongSource = new ParaPolicyIntake(
      db,
      authority,
      { ...config, sourceUri: `${sourceUri}-other` },
      clock,
    )
    expect(await wrongSource.getAcceptedReceipt()).toBeNull()
    await db.db
      .updateTable('space')
      .set({ deletedAt: clock().toISOString() })
      .where('uri', '=', space)
      .execute()
    expect(await intake.getAcceptedReceipt()).toBeNull()
    await db.db
      .updateTable('space')
      .set({ deletedAt: null })
      .where('uri', '=', space)
      .execute()
    await expect(
      intake.ingest(await sign(await next({ sourceVersion: 4 }))),
    ).rejects.toMatchObject({ error: 'PolicyProjectionOutOfOrder' })
    expect(await intake.getAcceptedReceipt()).toBeNull()
  })

  it('round-trips the fault migration without resetting the accepted policy', async () => {
    await intake.ingest(await sign())
    const state = await reader.getPolicyState(space)
    await getMigrator(db).migrateToOrThrow('003')
    await getMigrator(db).migrateToLatestOrThrow()
    expect(await reader.getPolicyState(space)).toEqual(state)
    expect(await reader.getPolicyFault(space)).toBeNull()
  })

  it('accepts a rotated key only after it is added to the pinned trust set', async () => {
    await intake.ingest(await sign())
    const rotated = await sign(
      await next(),
      {},
      { kid: 'publisher-2' },
      otherKey.privateKey,
    )
    await expect(intake.ingest(rotated)).rejects.toMatchObject({
      error: 'InvalidPolicyAssertion',
    })
    const updated = new ParaPolicyIntake(
      db,
      authority,
      {
        ...config,
        jwks: {
          keys: [
            ...config.jwks.keys,
            { ...(await exportJWK(otherKey.publicKey)), kid: 'publisher-2' },
          ],
        },
      },
      clock,
    )
    await updated.ingest(rotated)
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 2,
    })
  })

  it('copies pinned trust and rejects unsupported or private key configuration', async () => {
    const token = await sign()
    config.issuer = 'did:web:changed.example'
    config.jwks.keys[0].kid = 'changed-key'
    await intake.ingest(token)
    const original = {
      ...config,
      issuer,
      jwks: {
        keys: [{ ...(await exportJWK(key.publicKey)), kid: 'publisher-1' }],
      },
    }
    expect(() => new ParaPolicyIntake(db, member, original, clock)).toThrow()
    expect(
      () =>
        new ParaPolicyIntake(
          db,
          authority,
          { ...original, jwks: { keys: [] } },
          clock,
        ),
    ).toThrow()
    expect(
      () =>
        new ParaPolicyIntake(
          db,
          authority,
          {
            ...original,
            jwks: {
              keys: [{ ...original.jwks.keys[0], d: 'private-material' }],
            },
          },
          clock,
        ),
    ).toThrow()
    expect(
      () =>
        new ParaPolicyIntake(
          db,
          authority,
          {
            ...original,
            jwks: { keys: [original.jwks.keys[0], original.jwks.keys[0]] },
          },
          clock,
        ),
    ).toThrow()
  })
})
