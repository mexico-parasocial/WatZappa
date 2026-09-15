import { describe, expect, it } from 'vitest'
import {
  type HandoverRequest,
  type InstitutionMembership,
  authorize,
  canAssignRole,
  isInstitutionRole,
  isMembershipActive,
  roleCapabilities,
  validateHandover,
} from '../institutions.js'

/**
 * Boundary suite for institutional workspaces.
 *
 * These tests pin the property the authorization layer exists to provide: a
 * membership grants exactly its role's capabilities, in its own institution
 * and workspace, while it is active — and nothing else. They are written
 * against the pure policy module rather than the routes because the module is
 * the single definition every enforcement point is required to share.
 */

const NOW = new Date('2026-09-13T12:00:00Z')
const FUTURE = '2027-01-01T00:00:00Z'
const PAST = '2026-01-01T00:00:00Z'

function membership(
  overrides: Partial<InstitutionMembership> = {},
): InstitutionMembership {
  return {
    institutionId: 'inst-1',
    workspaceId: null,
    did: 'did:plc:alice',
    role: 'member',
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  }
}

function owner(did = 'did:plc:owner'): InstitutionMembership {
  return membership({ did, role: 'owner' })
}

describe('roleCapabilities', () => {
  it('grants the owner every capability', () => {
    const caps = roleCapabilities('owner')
    for (const cap of [
      'message.read',
      'message.send',
      'member.invite',
      'member.remove',
      'inbox.assign',
      'inbox.resolve',
      'policy.change',
      'audit.read',
      'export.request',
      'ownership.transfer',
    ] as const) {
      expect(caps.has(cap)).toBe(true)
    }
  })

  it('keeps guests to read-only and auditors to audit metadata', () => {
    expect([...roleCapabilities('guest')]).toEqual(['message.read'])
    expect([...roleCapabilities('auditor')]).toEqual(['audit.read'])
  })

  it('denies channel managers membership control', () => {
    const caps = roleCapabilities('channel_manager')
    expect(caps.has('inbox.assign')).toBe(true)
    expect(caps.has('member.invite')).toBe(false)
    expect(caps.has('member.remove')).toBe(false)
  })
})

describe('authorize', () => {
  it('denies without a membership', () => {
    const decision = authorize({
      membership: null,
      institutionId: 'inst-1',
      capability: 'message.read',
      now: NOW,
    })
    expect(decision).toEqual({ allowed: false, denial: 'no-membership' })
  })

  it('denies cross-institution access even for owners', () => {
    const decision = authorize({
      membership: owner(),
      institutionId: 'inst-2',
      capability: 'message.read',
      now: NOW,
    })
    expect(decision).toEqual({ allowed: false, denial: 'wrong-institution' })
  })

  it('denies revoked and expired memberships', () => {
    expect(
      authorize({
        membership: membership({ revokedAt: '2026-09-01T00:00:00Z' }),
        institutionId: 'inst-1',
        capability: 'message.read',
        now: NOW,
      }).denial,
    ).toBe('revoked')
    expect(
      authorize({
        membership: membership({ expiresAt: PAST }),
        institutionId: 'inst-1',
        capability: 'message.read',
        now: NOW,
      }).denial,
    ).toBe('expired')
  })

  it('fails closed on unparseable expiry', () => {
    expect(
      isMembershipActive(membership({ expiresAt: 'not-a-date' }), NOW),
    ).toBe(false)
  })

  it('scopes workspace-bound roles to their own workspace', () => {
    const admin = membership({
      role: 'workspace_admin',
      workspaceId: 'ws-a',
    })
    expect(
      authorize({
        membership: admin,
        institutionId: 'inst-1',
        workspaceId: 'ws-a',
        capability: 'member.invite',
        now: NOW,
      }).allowed,
    ).toBe(true)
    expect(
      authorize({
        membership: admin,
        institutionId: 'inst-1',
        workspaceId: 'ws-b',
        capability: 'member.invite',
        now: NOW,
      }),
    ).toEqual({ allowed: false, denial: 'wrong-workspace' })
  })

  it('denies capabilities the role does not hold', () => {
    const decision = authorize({
      membership: membership({ role: 'member' }),
      institutionId: 'inst-1',
      workspaceId: 'ws-a',
      capability: 'member.remove',
      now: NOW,
    })
    expect(decision).toEqual({
      allowed: false,
      denial: 'role-lacks-capability',
    })
  })

  it('denies anything outside the capability union, even for owners', () => {
    // Institutional roles must never authorize bicameral governance: chamber
    // seats and votes have no entry in the union, so they cannot be granted.
    const decision = authorize({
      membership: owner(),
      institutionId: 'inst-1',
      capability: 'chamber.vote' as never,
      now: NOW,
    })
    expect(decision).toEqual({ allowed: false, denial: 'unknown-capability' })
  })
})

describe('validateHandover', () => {
  const ownersByDid = new Map([
    ['did:plc:owner', owner('did:plc:owner')],
    ['did:plc:second', owner('did:plc:second')],
  ])

  function request(overrides: Partial<HandoverRequest> = {}): HandoverRequest {
    return {
      institutionId: 'inst-1',
      requester: owner('did:plc:owner'),
      requesterRecentAuthAt: '2026-09-13T11:55:00Z',
      successorDid: 'did:plc:successor',
      successor: membership({
        did: 'did:plc:successor',
        role: 'workspace_admin',
        workspaceId: 'ws-a',
        expiresAt: FUTURE,
      }),
      ownersByDid,
      approvals: [
        {
          approverDid: 'did:plc:second',
          approvedAt: '2026-09-13T11:56:00Z',
        },
      ],
      now: NOW,
      ...overrides,
    }
  }

  it('accepts a well-formed handover', () => {
    expect(validateHandover(request())).toEqual({ ok: true, failures: [] })
  })

  it('requires a second approver distinct from the requester', () => {
    expect(validateHandover(request({ approvals: [] })).failures).toContain(
      'missing-second-approval',
    )
    expect(
      validateHandover(
        request({
          approvals: [
            { approverDid: 'did:plc:owner', approvedAt: NOW.toISOString() },
          ],
        }),
      ).failures,
    ).toContain('approver-is-requester')
  })

  it('rejects approvals from non-owners', () => {
    const failures = validateHandover(
      request({
        approvals: [
          { approverDid: 'did:plc:random', approvedAt: NOW.toISOString() },
        ],
      }),
    ).failures
    expect(failures).toContain('approver-not-owner')
  })

  it('rejects stale requester authentication', () => {
    const failures = validateHandover(
      request({ requesterRecentAuthAt: '2026-09-13T10:00:00Z' }),
    ).failures
    expect(failures).toContain('requester-stale-auth')
  })

  it('rejects inactive or ineligible successors', () => {
    expect(validateHandover(request({ successor: null })).failures).toContain(
      'successor-inactive',
    )
    expect(
      validateHandover(
        request({
          successorDid: 'did:plc:guest',
          successor: membership({ did: 'did:plc:guest', role: 'guest' }),
        }),
      ).failures,
    ).toContain('successor-ineligible-role')
    expect(
      validateHandover(
        request({
          successorDid: 'did:plc:owner',
          successor: owner('did:plc:owner'),
        }),
      ).failures,
    ).toContain('successor-is-requester')
  })
})

describe('canAssignRole', () => {
  it('lets owners assign any role', () => {
    for (const targetRole of [
      'owner',
      'workspace_admin',
      'channel_manager',
      'member',
      'guest',
      'auditor',
      'records_custodian',
    ] as const) {
      expect(
        canAssignRole({
          institutionId: 'inst-1',
          grantor: owner(),
          targetRole,
          targetWorkspaceId: 'ws-a',
          now: NOW,
        }),
      ).toBe(true)
    }
  })

  it('lets workspace admins delegate operational roles in their own workspace', () => {
    const admin = membership({ role: 'workspace_admin', workspaceId: 'ws-a' })
    for (const targetRole of ['channel_manager', 'member', 'guest'] as const) {
      expect(
        canAssignRole({
          institutionId: 'inst-1',
          grantor: admin,
          targetRole,
          targetWorkspaceId: 'ws-a',
          now: NOW,
        }),
      ).toBe(true)
    }
    // …but not privileged roles, and not in other workspaces.
    expect(
      canAssignRole({
        institutionId: 'inst-1',
        grantor: admin,
        targetRole: 'workspace_admin',
        targetWorkspaceId: 'ws-a',
        now: NOW,
      }),
    ).toBe(false)
    expect(
      canAssignRole({
        institutionId: 'inst-1',
        grantor: admin,
        targetRole: 'member',
        targetWorkspaceId: 'ws-b',
        now: NOW,
      }),
    ).toBe(false)
  })

  it('denies members, guests, auditors, and inactive grantors', () => {
    for (const role of ['member', 'guest', 'auditor'] as const) {
      expect(
        canAssignRole({
          institutionId: 'inst-1',
          grantor: membership({ role, workspaceId: 'ws-a' }),
          targetRole: 'member',
          targetWorkspaceId: 'ws-a',
          now: NOW,
        }),
      ).toBe(false)
    }
    expect(
      canAssignRole({
        institutionId: 'inst-1',
        grantor: membership({ role: 'owner', revokedAt: PAST }),
        targetRole: 'member',
        targetWorkspaceId: 'ws-a',
        now: NOW,
      }),
    ).toBe(false)
    expect(
      canAssignRole({
        institutionId: 'inst-2',
        grantor: owner(),
        targetRole: 'member',
        targetWorkspaceId: 'ws-a',
        now: NOW,
      }),
    ).toBe(false)
  })

  it('recognizes only known roles', () => {
    expect(isInstitutionRole('owner')).toBe(true)
    expect(isInstitutionRole('superadmin')).toBe(false)
  })
})
