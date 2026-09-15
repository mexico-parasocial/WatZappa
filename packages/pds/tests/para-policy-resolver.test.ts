import type { ParaPolicyInput } from '../src/actor-store/para-policy/reader.js'
import {
  type ParaPolicyRequest,
  ParaPolicyResolver,
} from '../src/actor-store/para-policy/resolver.js'

const did = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd'
const space = `at://${did}/space/com.para.space.community/immutable-id`
const now = Date.parse('2026-09-13T00:00:30Z')
const stamp = '2026-09-13T00:00:00Z'
const request: ParaPolicyRequest = {
  space,
  principalDid: did,
  clientId: 'https://client.example',
  collection: 'com.para.highlight',
  action: 'create',
  now,
  policyEpoch: 3,
}
function policy(): ParaPolicyInput {
  return {
    space: {
      uri: space,
      authority: did,
      type: 'com.para.space.community',
      createdAt: stamp,
      deletedAt: null,
    },
    state: {
      space,
      sourceUri: `at://${did}/com.para.community.board/id`,
      sourceCid: 'fixture',
      sourceIssuer: 'did:web:appview.example',
      sourceVersion: 5,
      policyEpoch: 3,
      projectionDigest: '0'.repeat(64),
      projectionStatus: 'ready',
      issuedAt: stamp,
      receivedAt: stamp,
      signedDelta: 'fixture',
    },
    member: {
      space,
      did,
      membershipState: 'active',
      roles: ['legacy-admin'],
      roleAssignments: [
        {
          role: 'moderator',
          validFrom: stamp,
          validUntil: '2026-09-13T00:01:00Z',
        },
      ],
      sourceVersion: 2,
      updatedAt: stamp,
    },
  }
}
const resolver = new ParaPolicyResolver(
  [
    {
      space,
      collection: request.collection,
      action: 'create',
      clientIds: [request.clientId],
      roles: ['moderator'],
    },
    {
      space,
      collection: request.collection,
      action: 'credential',
      clientIds: [request.clientId],
      roles: [],
    },
  ],
  120_000,
)

describe('PARA policy resolver', () => {
  it('allows an explicitly scoped write with the current epoch and effective role', () => {
    expect(resolver.resolve(request, policy())).toEqual({
      allowed: true,
      policyEpoch: 3,
      roles: ['moderator'],
    })
  })
  it('allows a configured membership credential without a prior epoch', () => {
    expect(
      resolver.resolve(
        { ...request, action: 'credential', policyEpoch: undefined },
        policy(),
      ).allowed,
    ).toBe(true)
  })
  it.each([{ policyEpoch: 2 }, { policyEpoch: undefined }])(
    'rejects stale or missing write epochs',
    (change) => {
      expect(
        resolver.resolve({ ...request, ...change }, policy()),
      ).toMatchObject({ allowed: false, denial: 'epoch-mismatch' })
    },
  )
  it.each(['pending', 'left', 'removed', 'blocked'] as const)(
    'rejects %s members despite retained roles',
    (state) => {
      const input = policy()
      input.member!.membershipState = state
      expect(resolver.resolve(request, input)).toMatchObject({
        allowed: false,
        denial: 'not-active-member',
      })
    },
  )
  it('rejects an unknown member', () => {
    expect(
      resolver.resolve(request, { ...policy(), member: null }),
    ).toMatchObject({ allowed: false, denial: 'not-active-member' })
  })
  it('does not fall back to flat roles when a structured role expires', () => {
    const input = policy()
    input.member!.roles = ['moderator']
    expect(
      resolver.resolve(
        { ...request, now: Date.parse('2026-09-13T00:01:00Z') },
        input,
      ),
    ).toMatchObject({ allowed: false, denial: 'role-denied' })
    expect(
      resolver.resolve({ ...request, now: Date.parse(stamp) }, input).allowed,
    ).toBe(true)
  })
  it.each([
    { clientId: 'https://other.example' },
    { collection: 'com.para.other' },
    { action: 'delete' as const },
  ])('requires explicit client, collection, and action rules', (change) => {
    expect(resolver.resolve({ ...request, ...change }, policy())).toMatchObject(
      { allowed: false, denial: 'rule-denied' },
    )
  })
  it('rejects a cross-space projection', () => {
    expect(
      resolver.resolve({ ...request, space: `${space}-other` }, policy()),
    ).toMatchObject({ allowed: false, denial: 'space-unavailable' })
  })
  it('rejects missing, deleted, and stale projections', () => {
    expect(
      resolver.resolve(request, { ...policy(), state: null }),
    ).toMatchObject({ allowed: false, denial: 'projection-unavailable' })
    const deleted = policy()
    deleted.state!.projectionStatus = 'space-deleted'
    expect(resolver.resolve(request, deleted)).toMatchObject({
      allowed: false,
      denial: 'projection-unavailable',
    })
    expect(
      resolver.resolve({ ...request, now: now + 120_000 }, policy()),
    ).toMatchObject({ allowed: false, denial: 'projection-stale' })
    expect(resolver.resolve({ ...request, now: NaN }, policy())).toMatchObject({
      allowed: false,
      denial: 'projection-stale',
    })
  })
  it('does not grant any permission with an empty rule set', () => {
    expect(
      new ParaPolicyResolver([], 120_000).resolve(request, policy()),
    ).toMatchObject({ allowed: false, denial: 'rule-denied' })
  })
})
