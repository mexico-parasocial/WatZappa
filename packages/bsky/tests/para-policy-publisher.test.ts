import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateKeyPair } from 'jose'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  test,
} from 'vitest'
import {
  type ActorDb,
  getDb,
  getMigrator,
} from '../../pds/src/actor-store/db/index.js'
import { ParaPolicyIntake } from '../../pds/src/actor-store/para-policy/intake.js'
import { ParaPolicyReader } from '../../pds/src/actor-store/para-policy/reader.js'
import { ParaPolicyResolver } from '../../pds/src/actor-store/para-policy/resolver.js'
import {
  ParaPolicyPublisher,
  type ParaPolicyPublisherConfig,
  type ParaPolicyUpdate,
} from '../src/para-policy/publisher.js'

const authority = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd'
const member = 'did:plc:7zp4oxrdragtjsm2j2vknwkz'
const secondMember = 'did:web:second.example'
const space = `at://${authority}/space/com.para.space.community/community-immutable-id`
const issuer = 'did:web:appview.para.example'
const audience = `${authority}#para_policy_intake`
const sourceUri = `at://${authority}/com.para.community.board/community-immutable-id`
const sourceCid = 'bafyreibjza57bggyhpyh4nnbkglkjetmv7nnnpb7rufpy5bky3pbmnh7am'
const collection = 'com.para.test.record'

describe('AppView policy publisher → PDS interoperability', () => {
  let directory: string
  let db: ActorDb
  let reader: ParaPolicyReader
  let publisher: ParaPolicyPublisher
  let intake: ParaPolicyIntake
  let config: ParaPolicyPublisherConfig
  let key: Awaited<ReturnType<typeof generateKeyPair>>
  let now: number
  const clock = () => new Date(now * 1_000)

  beforeAll(async () => {
    key = await generateKeyPair('EdDSA')
  })

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'watzappa-policy-interop-'))
    db = getDb(path.join(directory, 'actor.sqlite'))
    await getMigrator(db).migrateToLatestOrThrow()
    await db.ensureWal()
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
      kid: 'publisher-1',
      lifetimeSec: 300,
    }
    publisher = await ParaPolicyPublisher.create(config, key.privateKey, clock)
    intake = receiver(publisher)
    reader = new ParaPolicyReader(db)
  })

  afterEach(async () => {
    await db.db.destroy()
    await rm(directory, { recursive: true, force: true })
  })

  function receiver(signer: ParaPolicyPublisher) {
    return new ParaPolicyIntake(
      db,
      authority,
      {
        issuer,
        audience,
        space,
        sourceUri,
        jwks: signer.getJwks(),
        allowBootstrap: true,
        maxAssertionAgeSec: 300,
      },
      clock,
    )
  }

  function update(overrides: Partial<ParaPolicyUpdate> = {}): ParaPolicyUpdate {
    return {
      kind: 'snapshot',
      sourceCid,
      sourceVersion: 1,
      policyEpoch: 1,
      previousDeltaDigest: null,
      members: [
        { did: member, membershipState: 'active', roles: ['moderator'] },
      ],
      ...overrides,
    }
  }

  async function decision(policyEpoch: number, roles = ['moderator']) {
    const resolver = new ParaPolicyResolver(
      [{ space, collection, action: 'create', clientIds: ['client'], roles }],
      600_000,
    )
    const input = await db.transaction((tx) =>
      new ParaPolicyReader(tx).getPolicyInput(space, member),
    )
    return resolver.resolve(
      {
        space,
        principalDid: member,
        collection,
        action: 'create',
        clientId: 'client',
        policyEpoch,
        now: Math.max(Date.now(), clock().getTime()),
      },
      input,
    )
  }

  async function rejectsWith(operation: Promise<unknown>, error: string) {
    await expect(operation).rejects.toSatisfy((failure) => {
      expect(failure.error).toBe(error)
      return true
    })
  }

  it('signs an admission and revocation that change actual PDS authorization decisions', async () => {
    const admitted = await publisher.prepare(update())
    await intake.ingest(admitted.assertion)
    expect(await decision(1)).toMatchObject({ allowed: true, policyEpoch: 1 })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionDigest: admitted.projectionDigest,
      signedDelta: admitted.assertion,
    })
    const revoked = await publisher.prepare(
      update({
        kind: 'patch',
        sourceVersion: 2,
        policyEpoch: 2,
        previousDeltaDigest: admitted.projectionDigest,
        members: [{ did: member, membershipState: 'removed' }],
      }),
    )
    await intake.ingest(revoked.assertion)
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionDigest: revoked.projectionDigest,
    })
    expect(await decision(1)).toMatchObject({
      allowed: false,
      denial: 'epoch-mismatch',
    })
    expect(await decision(2)).toMatchObject({
      allowed: false,
      denial: 'not-active-member',
    })
  })

  it('agrees on datetime normalization, optional fields and structured role precedence', async () => {
    const validFrom = new Date((now - 10) * 1_000).toISOString()
    const validUntil = new Date((now + 30) * 1_000).toISOString()
    const prepared = await publisher.prepare(
      update({
        members: [
          {
            did: member,
            membershipState: 'active',
            roles: ['owner'],
            roleAssignments: [
              {
                role: 'moderator',
                validFrom: validFrom.replace('Z', '+00:00'),
                validUntil,
                ratifiedBy: sourceUri,
              },
            ],
          },
        ],
      }),
    )
    await intake.ingest(prepared.assertion)
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionDigest: prepared.projectionDigest,
    })
    expect(await reader.getPolicyMember(space, member)).toMatchObject({
      roleAssignments: [
        { role: 'moderator', validFrom, validUntil, ratifiedBy: sourceUri },
      ],
    })
    expect(await decision(1)).toMatchObject({ allowed: true })
    expect(await decision(1, ['owner'])).toMatchObject({
      allowed: false,
      denial: 'role-denied',
    })
    now += 30
    expect(await decision(1)).toMatchObject({
      allowed: false,
      denial: 'role-denied',
    })
  })

  it('preserves untouched members in patches and retires omitted snapshot members', async () => {
    const initial = await publisher.prepare(
      update({
        members: [
          { did: member, membershipState: 'active' },
          { did: secondMember, membershipState: 'active' },
        ],
      }),
    )
    await intake.ingest(initial.assertion)
    const patch = await publisher.prepare(
      update({
        kind: 'patch',
        sourceVersion: 2,
        policyEpoch: 2,
        previousDeltaDigest: initial.projectionDigest,
        members: [{ did: secondMember, membershipState: 'blocked' }],
      }),
    )
    await intake.ingest(patch.assertion)
    expect(await reader.getPolicyMember(space, member)).toMatchObject({
      membershipState: 'active',
      sourceVersion: 1,
    })
    const snapshot = await publisher.prepare(
      update({
        sourceVersion: 3,
        policyEpoch: 3,
        previousDeltaDigest: patch.projectionDigest,
        members: [],
      }),
    )
    await intake.ingest(snapshot.assertion)
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionDigest: snapshot.projectionDigest,
    })
    expect(await reader.getPolicyMember(space, member)).toMatchObject({
      membershipState: 'removed',
    })
    expect(await reader.getPolicyMember(space, secondMember)).toMatchObject({
      membershipState: 'removed',
    })
  })

  it('retries persisted bytes without refreshing policy freshness', async () => {
    const prepared = await publisher.prepare(update())
    // @NOTE exercise transport serialization, not regeneration by the signer.
    const persisted = JSON.stringify(prepared)
    await intake.ingest(prepared.assertion)
    const before = await reader.getPolicyState(space)
    now += 5
    const reloaded = JSON.parse(persisted) as typeof prepared
    await intake.ingest(reloaded.assertion)
    expect(await reader.getPolicyState(space)).toEqual(before)
    expect(reloaded.projectionDigest).toBe(before?.projectionDigest)
  })

  it('rejects expired prepared bytes rather than silently refreshing them', async () => {
    const prepared = await publisher.prepare(update())
    now = prepared.expiresAt
    await rejectsWith(
      intake.ingest(prepared.assertion),
      'InvalidPolicyAssertion',
    )
    expect(await reader.getPolicyState(space)).toBeNull()
  })

  it('rejects updates targeting another audience or space', async () => {
    const wrongAudience = await ParaPolicyPublisher.create(
      { ...config, audience: 'other-pds' },
      key.privateKey,
      clock,
    )
    await rejectsWith(
      intake.ingest((await wrongAudience.prepare(update())).assertion),
      'InvalidPolicyAssertion',
    )
    const wrongSpace = await ParaPolicyPublisher.create(
      { ...config, space: `${space}-other` },
      key.privateKey,
      clock,
    )
    await rejectsWith(
      intake.ingest((await wrongSpace.prepare(update())).assertion),
      'InvalidPolicyAssertion',
    )
    expect(await reader.getPolicyState(space)).toBeNull()
  })

  it('requires a new trusted public key before accepting a rotated publisher', async () => {
    const initial = await publisher.prepare(update())
    await intake.ingest(initial.assertion)
    const rotatedKey = await generateKeyPair('EdDSA')
    const rotated = await ParaPolicyPublisher.create(
      { ...config, kid: 'publisher-2' },
      rotatedKey.privateKey,
      clock,
    )
    const prepared = await rotated.prepare(
      update({
        sourceVersion: 2,
        policyEpoch: 2,
        previousDeltaDigest: initial.projectionDigest,
      }),
    )
    await rejectsWith(
      intake.ingest(prepared.assertion),
      'InvalidPolicyAssertion',
    )
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 1,
    })
    await receiver(rotated).ingest(prepared.assertion)
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionDigest: prepared.projectionDigest,
      sourceVersion: 2,
    })
  })

  it('fails closed when delivery skips a publisher version', async () => {
    const first = await publisher.prepare(update())
    await intake.ingest(first.assertion)
    const second = await publisher.prepare(
      update({
        sourceVersion: 2,
        policyEpoch: 2,
        previousDeltaDigest: first.projectionDigest,
      }),
    )
    const third = await publisher.prepare(
      update({
        sourceVersion: 3,
        policyEpoch: 3,
        previousDeltaDigest: second.projectionDigest,
      }),
    )
    await rejectsWith(
      intake.ingest(third.assertion),
      'PolicyProjectionOutOfOrder',
    )
    expect(await decision(1)).toMatchObject({
      allowed: false,
      denial: 'projection-unavailable',
    })
    await rejectsWith(
      intake.ingest(second.assertion),
      'PolicyProjectionRebootstrapRequired',
    )
  })

  it('exposes only independent public JWKS and copies configuration', async () => {
    const publicKeys = publisher.getJwks()
    expect(publicKeys.keys[0]).not.toHaveProperty('d')
    expect(Object.keys(publicKeys.keys[0]).sort()).toEqual([
      'alg',
      'crv',
      'kid',
      'kty',
      'use',
      'x',
    ])
    publicKeys.keys[0].kid = 'mutated'
    config.audience = 'mutated'
    expect(publisher.getJwks().keys[0].kid).toBe('publisher-1')
    await intake.ingest((await publisher.prepare(update())).assertion)
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
    })
  })

  test.each([
    {
      label: 'empty patch',
      change: {
        kind: 'patch',
        previousDeltaDigest: '0'.repeat(64),
        members: [],
      },
    },
    { label: 'patch without predecessor', change: { kind: 'patch' } },
    {
      label: 'duplicate members',
      change: {
        members: [
          { did: member, membershipState: 'active' },
          { did: member, membershipState: 'removed' },
        ],
      },
    },
    { label: 'invalid CID', change: { sourceCid: 'not-a-cid' } },
    { label: 'invalid version', change: { sourceVersion: 0 } },
    {
      label: 'reversed role interval',
      change: {
        members: [
          {
            did: member,
            membershipState: 'active',
            roleAssignments: [
              {
                role: 'moderator',
                validFrom: '2026-10-02T00:00:00Z',
                validUntil: '2026-10-01T00:00:00Z',
              },
            ],
          },
        ],
      },
    },
  ] satisfies { label: string; change: Partial<ParaPolicyUpdate> }[])(
    'refuses to sign $label',
    async ({ change }) => {
      await expect(publisher.prepare(update(change))).rejects.toThrow()
      expect(await reader.getPolicyState(space)).toBeNull()
    },
  )

  it('refuses oversized signed snapshots instead of returning an undeliverable artifact', async () => {
    const members = Array.from({ length: 200 }, (_, index) => ({
      did: `did:web:member-${index}.example`,
      membershipState: 'active' as const,
    }))
    await expect(publisher.prepare(update({ members }))).rejects.toThrow(
      'receiver limit',
    )
  })

  it('rejects public-only and non-Ed25519 signing keys', async () => {
    await expect(
      ParaPolicyPublisher.create(config, key.publicKey, clock),
    ).rejects.toThrow('Ed25519 private key')
    const wrong = await generateKeyPair('ES256')
    await expect(
      ParaPolicyPublisher.create(config, wrong.privateKey, clock),
    ).rejects.toThrow('Ed25519 private key')
  })
})
