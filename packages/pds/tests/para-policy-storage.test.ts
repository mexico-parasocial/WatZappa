import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { AtUri } from '@atproto/syntax'
import { BlobTransactor } from '../src/actor-store/blob/transactor.js'
import {
  type ActorDb,
  getDb,
  getMigrator,
} from '../src/actor-store/db/index.js'
import { ParaPolicyReader } from '../src/actor-store/para-policy/reader.js'
import { ParaPolicyTransactor } from '../src/actor-store/para-policy/transactor.js'
import {
  type ParaPolicyProjectionDelta,
  getEffectiveParaPolicyRoles,
} from '../src/actor-store/para-policy/types.js'
import { SpaceTransactor } from '../src/actor-store/space/transactor.js'
import type { BackgroundQueue } from '../src/background.js'

const authority = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd'
const member = 'did:plc:7zp4oxrdragtjsm2j2vknwkz'
const formerMember = 'did:plc:3zp4oxrdragtjsm2j2vknwkz'
const space = AtUri.makeSpace(
  authority,
  'com.para.space.community',
  'community-immutable-id',
)
  .spaceRef()!
  .toString()
const sourceUri = `at://${authority}/com.para.community.board/community-immutable-id`
const sourceCidV1 =
  'bafyreibjza57bggyhpyh4nnbkglkjetmv7nnnpb7rufpy5bky3pbmnh7am'
const sourceCidV2 =
  'bafyreidy7huuanwhtrn62jfguviy4uzmiugnbmgtjhy5fvgs3wrdqqavsy'
const sourceCidV3 =
  'bafyreihq6xoatw422gxfp5kqxa7gvj243o4fmzhseoqcwgjqjkzfjflitm'

describe('PARA policy projection storage', () => {
  let directory: string
  let db: ActorDb
  let reader: ParaPolicyReader

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'watzappa-para-policy-'))
    db = getDb(path.join(directory, 'actor.sqlite'))
    await getMigrator(db).migrateToLatestOrThrow()
    reader = new ParaPolicyReader(db)

    await db.transaction(async (tx) => {
      await spaceTransactor(tx).createSpace(space, {
        readPolicy: 'member-list',
        readManagingApp: null,
        writePolicy: 'member-list',
        writeManagingApp: null,
        appAccessType: 'open',
        appAllowed: '[]',
      })
    })
  })

  afterEach(async () => {
    db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('applies chained deltas and preserves PARA role-assignment semantics', async () => {
    const first = delta({
      members: [
        {
          did: member,
          membershipState: 'active',
          roles: ['legacy-role'],
          roleAssignments: [
            {
              role: 'moderator',
              validFrom: '2026-10-01T00:00:00.000Z',
              validUntil: '2026-11-01T00:00:00.000Z',
            },
          ],
        },
      ],
    })
    await apply(first)

    const stateAfterFirst = await reader.getPolicyState(space)
    const stored = await reader.getPolicyMember(space, member)
    expect(stateAfterFirst).toMatchObject({
      sourceVersion: 1,
      policyEpoch: 1,
      projectionStatus: 'ready',
    })
    expect(stored).toMatchObject({
      did: member,
      membershipState: 'active',
      roles: ['legacy-role'],
      sourceVersion: 1,
    })
    expect(
      getEffectiveParaPolicyRoles(stored!, Date.parse('2026-10-15')),
    ).toEqual(['moderator'])
    expect(
      getEffectiveParaPolicyRoles(stored!, Date.parse('2026-11-15')),
    ).toEqual([])

    // Delivery can be retried after a transport failure, but only when it is
    // the same complete projection, including every member materialization.
    await apply(first)

    await apply(
      delta({
        kind: 'patch',
        sourceVersion: 2,
        policyEpoch: 2,
        previousDeltaDigest: stateAfterFirst!.projectionDigest,
        sourceCid: sourceCidV2,
        signedDelta: 'signed-policy-delta-v2',
        members: [
          {
            did: member,
            membershipState: 'blocked',
            roles: [],
            roleAssignments: [],
          },
        ],
      }),
    )

    await expect(reader.getPolicyState(space)).resolves.toMatchObject({
      sourceVersion: 2,
      policyEpoch: 2,
    })
    await expect(reader.getPolicyMember(space, member)).resolves.toMatchObject({
      membershipState: 'blocked',
      sourceVersion: 2,
    })
    await expect(reader.getPolicyDelta(space, 2)).resolves.toMatchObject({
      kind: 'patch',
      previousDeltaDigest: stateAfterFirst!.projectionDigest,
      sourceCid: sourceCidV2,
    })
  })

  it('fails closed on gaps, rollback, chain mismatch, and conflicting retries', async () => {
    const first = delta({
      members: [
        {
          did: member,
          membershipState: 'active',
          roles: ['member'],
          roleAssignments: [],
        },
      ],
    })
    await apply(first)
    const state = await reader.getPolicyState(space)

    await expect(
      apply(
        delta({
          kind: 'patch',
          sourceVersion: 3,
          policyEpoch: 3,
          previousDeltaDigest: state!.projectionDigest,
          sourceCid: sourceCidV3,
          signedDelta: 'signed-policy-delta-v3',
          members: [
            {
              did: member,
              membershipState: 'active',
              roles: ['member'],
              roleAssignments: [],
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ error: 'PolicyProjectionOutOfOrder' })
    await expect(
      apply(
        delta({
          kind: 'patch',
          sourceVersion: 2,
          policyEpoch: 1,
          previousDeltaDigest: state!.projectionDigest,
          sourceCid: sourceCidV2,
          signedDelta: 'signed-policy-delta-v2',
          members: [
            {
              did: member,
              membershipState: 'active',
              roles: ['member'],
              roleAssignments: [],
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ error: 'PolicyProjectionEpochRollback' })
    await expect(
      apply(
        delta({
          kind: 'patch',
          sourceVersion: 2,
          policyEpoch: 2,
          previousDeltaDigest: '0'.repeat(64),
          sourceCid: sourceCidV2,
          signedDelta: 'signed-policy-delta-v2',
          members: [
            {
              did: member,
              membershipState: 'active',
              roles: ['member'],
              roleAssignments: [],
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ error: 'PolicyProjectionChainMismatch' })
    await expect(
      apply({
        ...first,
        members: [
          {
            did: member,
            membershipState: 'blocked',
            roles: [],
            roleAssignments: [],
          },
        ],
      }),
    ).rejects.toMatchObject({ error: 'PolicyProjectionOutOfOrder' })
    await expect(
      apply({ ...first, sourceUri: `${sourceUri}-other` }),
    ).rejects.toMatchObject({ error: 'PolicyProjectionSourceMismatch' })

    await expect(reader.getPolicyState(space)).resolves.toMatchObject({
      sourceVersion: 1,
      policyEpoch: 1,
      signedDelta: first.signedDelta,
    })
    await expect(reader.getPolicyMember(space, member)).resolves.toMatchObject({
      membershipState: 'active',
      sourceVersion: 1,
    })
  })

  it('makes snapshot omission a removed tombstone while patches preserve unnamed members', async () => {
    const first = delta({
      members: [
        {
          did: member,
          membershipState: 'active',
          roles: ['member'],
          roleAssignments: [],
        },
        {
          did: formerMember,
          membershipState: 'active',
          roles: ['moderator'],
          roleAssignments: [],
        },
      ],
    })
    await apply(first)
    const stateAfterFirst = await reader.getPolicyState(space)

    await apply(
      delta({
        kind: 'patch',
        sourceVersion: 2,
        policyEpoch: 2,
        previousDeltaDigest: stateAfterFirst!.projectionDigest,
        sourceCid: sourceCidV2,
        signedDelta: 'signed-policy-delta-v2',
        members: [
          {
            did: member,
            membershipState: 'active',
            roles: ['steward'],
            roleAssignments: [],
          },
        ],
      }),
    )
    await expect(
      reader.getPolicyMember(space, formerMember),
    ).resolves.toMatchObject({
      membershipState: 'active',
      roles: ['moderator'],
      sourceVersion: 1,
    })

    const stateAfterPatch = await reader.getPolicyState(space)
    await apply(
      delta({
        kind: 'snapshot',
        sourceVersion: 3,
        policyEpoch: 3,
        previousDeltaDigest: stateAfterPatch!.projectionDigest,
        sourceCid: sourceCidV3,
        signedDelta: 'signed-policy-delta-v3',
        members: [
          {
            did: member,
            membershipState: 'active',
            roles: ['steward'],
            roleAssignments: [],
          },
        ],
      }),
    )
    await expect(
      reader.getPolicyMember(space, formerMember),
    ).resolves.toMatchObject({
      membershipState: 'removed',
      roles: [],
      roleAssignments: [],
      sourceVersion: 3,
    })
  })

  it('strictly decodes untrusted projection input and requires the authority store', async () => {
    await expect(
      apply({
        ...delta(),
        sourceCid: 'not-a-cid',
      }),
    ).rejects.toMatchObject({ error: 'InvalidPolicyProjection' })
    await expect(
      apply({
        ...delta(),
        members: [
          {
            did: member,
            membershipState: 'active',
            roles: [],
            roleAssignments: [{ role: 'moderator', validUntil: '' }] as never,
          },
        ],
      }),
    ).rejects.toMatchObject({ error: 'InvalidPolicyProjection' })
    await expect(
      db.transaction((tx) =>
        new ParaPolicyTransactor(tx, member).applyPolicyDelta(delta()),
      ),
    ).rejects.toMatchObject({ error: 'NotSpaceOwner' })

    await apply(
      delta({
        sourceVersion: 41,
        policyEpoch: 9,
        sourceCid: sourceCidV3,
        signedDelta: 'signed-policy-checkpoint-v41',
      }),
    )
    await expect(reader.getPolicyState(space)).resolves.toMatchObject({
      sourceVersion: 41,
      policyEpoch: 9,
    })
  })

  it('retains a deletion high-water mark and requires a newer snapshot after reactivation', async () => {
    const first = delta({
      members: [
        {
          did: member,
          membershipState: 'active',
          roles: ['member'],
          roleAssignments: [],
        },
      ],
    })
    await apply(first)
    const stateAfterFirst = await reader.getPolicyState(space)

    await db.transaction((tx) => spaceTransactor(tx).deleteSpace(space))
    await expect(reader.getPolicyState(space)).resolves.toMatchObject({
      projectionStatus: 'space-deleted',
      sourceVersion: 1,
    })
    await expect(reader.getPolicyMember(space, member)).resolves.toMatchObject({
      membershipState: 'active',
    })

    await db.transaction((tx) => spaceTransactor(tx).ensureSpace(space))
    await expect(apply(first)).rejects.toMatchObject({
      error: 'PolicyProjectionRebootstrapRequired',
    })
    await apply(
      delta({
        kind: 'snapshot',
        sourceVersion: 2,
        policyEpoch: 2,
        previousDeltaDigest: stateAfterFirst!.projectionDigest,
        sourceCid: sourceCidV2,
        signedDelta: 'signed-policy-rebootstrap-v2',
        members: [],
      }),
    )
    await expect(reader.getPolicyState(space)).resolves.toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 2,
    })
    await expect(reader.getPolicyMember(space, member)).resolves.toMatchObject({
      membershipState: 'removed',
      sourceVersion: 2,
    })
  })

  it('reads one consistent authorization input only inside a transaction', async () => {
    await apply(
      delta({
        members: [
          { did: member, membershipState: 'active', roles: ['member'] },
        ],
      }),
    )
    await expect(reader.getPolicyInput(space, member)).rejects.toThrow(
      'Transaction required',
    )
    const input = await db.transaction((tx) =>
      new ParaPolicyReader(tx).getPolicyInput(space, member),
    )
    expect(input.space?.uri).toBe(space)
    expect(input.state?.policyEpoch).toBe(1)
    expect(input.member?.roles).toEqual(['member'])
  })

  const apply = (value: ParaPolicyProjectionDelta) =>
    db.transaction((tx) =>
      new ParaPolicyTransactor(tx, authority).applyPolicyDelta(value),
    )

  const spaceTransactor = (actorDb: ActorDb) => {
    const blob = new BlobTransactor(
      actorDb,
      {} as never,
      { add: () => undefined } as unknown as BackgroundQueue,
    )
    return new SpaceTransactor(actorDb, blob)
  }
})

const delta = (
  overrides: Partial<ParaPolicyProjectionDelta> = {},
): ParaPolicyProjectionDelta => ({
  kind: 'snapshot',
  space,
  sourceUri,
  sourceCid: sourceCidV1,
  sourceIssuer: 'did:web:appview.para.example',
  sourceVersion: 1,
  policyEpoch: 1,
  previousDeltaDigest: null,
  issuedAt: '2026-09-13T00:00:00.000Z',
  signedDelta: 'signed-policy-delta-v1',
  members: [],
  ...overrides,
})
