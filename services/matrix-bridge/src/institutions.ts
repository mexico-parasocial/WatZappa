/**
 * Institutional workspaces: roles, capabilities, and authorization decisions.
 *
 * Pure policy module — no database, no network, no clock. The bridge's route
 * layer loads memberships and calls {@link authorize}; the database layer
 * persists them. Keeping the matrix here means every enforcement point shares
 * one definition of what each role may do.
 *
 * @NOTE file bytes are authorized by their atproto host, not by this module.
 * The bridge references atproto URIs inside messages; `message.read` covers
 * seeing the reference, never the bytes behind it.
 */

/** Roles in an institutional workspace, from most to least privileged. */
export type InstitutionRole =
  | 'owner'
  | 'workspace_admin'
  | 'channel_manager'
  | 'member'
  | 'guest'
  | 'auditor'
  | 'records_custodian'

/**
 * Actions the bridge authorizes. Deliberately closed: anything outside this
 * union — chamber seats, votes, ballot operations — is denied by construction,
 * so an institutional role can never authorize bicameral governance.
 */
export type InstitutionCapability =
  | 'message.read'
  | 'message.send'
  | 'member.invite'
  | 'member.remove'
  | 'inbox.assign'
  | 'inbox.resolve'
  | 'policy.change'
  | 'audit.read'
  | 'export.request'
  | 'ownership.transfer'

export type AuthorizationDenial =
  | 'no-membership'
  | 'wrong-institution'
  | 'revoked'
  | 'expired'
  | 'wrong-workspace'
  | 'role-lacks-capability'
  | 'unknown-capability'

export interface AuthorizationDecision {
  allowed: boolean
  denial: AuthorizationDenial | null
}

/**
 * One person's standing in an institution. `workspaceId` is null for
 * institution-wide roles (owner, auditor, records_custodian); workspace-bound
 * roles carry the workspace they operate in.
 */
export interface InstitutionMembership {
  institutionId: string
  workspaceId: string | null
  did: string
  role: InstitutionRole
  /** ISO datetime, or null for no expiry. Unparseable values fail closed. */
  expiresAt: string | null
  /** ISO datetime once revoked, otherwise null. */
  revokedAt: string | null
}

const WORKSPACE_SCOPED: ReadonlySet<InstitutionCapability> = new Set([
  'message.read',
  'message.send',
  'member.invite',
  'member.remove',
  'inbox.assign',
  'inbox.resolve',
])

const ROLE_CAPABILITIES: Readonly<
  Record<InstitutionRole, ReadonlySet<InstitutionCapability>>
> = {
  owner: new Set([
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
  ]),
  workspace_admin: new Set([
    'message.read',
    'message.send',
    'member.invite',
    'member.remove',
    'inbox.assign',
    'inbox.resolve',
  ]),
  channel_manager: new Set([
    'message.read',
    'message.send',
    'inbox.assign',
    'inbox.resolve',
  ]),
  member: new Set(['message.read', 'message.send']),
  guest: new Set(['message.read']),
  auditor: new Set(['audit.read']),
  records_custodian: new Set(['audit.read', 'export.request']),
}

/** Capabilities granted to a role. Returns an empty set for unknown roles. */
export function roleCapabilities(
  role: InstitutionRole,
): ReadonlySet<InstitutionCapability> {
  return ROLE_CAPABILITIES[role] ?? new Set()
}

/** True for capabilities that are checked against a specific workspace. */
export function isWorkspaceScoped(capability: InstitutionCapability): boolean {
  return WORKSPACE_SCOPED.has(capability)
}

/** Active means present, unrevoked, and unexpired at `now`. */
export function isMembershipActive(
  membership: InstitutionMembership,
  now: Date = new Date(),
): boolean {
  if (membership.revokedAt !== null) return false
  if (membership.expiresAt === null) return true
  const expires = Date.parse(membership.expiresAt)
  if (Number.isNaN(expires)) return false
  return expires > now.getTime()
}

export interface AuthorizeInput {
  membership: InstitutionMembership | null
  institutionId: string
  /** Required when `capability` is workspace-scoped. */
  workspaceId?: string
  capability: InstitutionCapability
  now?: Date
}

/**
 * Decide whether one membership may perform one action. Fails closed on every
 * malformed input: no membership, institution or workspace mismatch, revoked
 * or expired standing, or a capability the role does not hold.
 */
export function authorize(input: AuthorizeInput): AuthorizationDecision {
  const { membership, institutionId, workspaceId, capability } = input
  const now = input.now ?? new Date()

  if (!isKnownInstitutionCapability(capability)) {
    return { allowed: false, denial: 'unknown-capability' }
  }
  if (membership === null) {
    return { allowed: false, denial: 'no-membership' }
  }
  if (membership.institutionId !== institutionId) {
    return { allowed: false, denial: 'wrong-institution' }
  }
  if (membership.revokedAt !== null) {
    return { allowed: false, denial: 'revoked' }
  }
  if (!isMembershipActive(membership, now)) {
    return { allowed: false, denial: 'expired' }
  }
  if (
    WORKSPACE_SCOPED.has(capability) &&
    membership.workspaceId !== null &&
    membership.workspaceId !== workspaceId
  ) {
    return { allowed: false, denial: 'wrong-workspace' }
  }
  if (!roleCapabilities(membership.role).has(capability)) {
    return { allowed: false, denial: 'role-lacks-capability' }
  }
  return { allowed: true, denial: null }
}

const KNOWN_CAPABILITIES: ReadonlySet<string> = new Set([
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
])

function isKnownInstitutionCapability(capability: string): boolean {
  return KNOWN_CAPABILITIES.has(capability)
}

// Ownership handover.

/** Window in which the requester's re-authentication stays valid. */
export const HANDOVER_RECENT_AUTH_WINDOW_MS = 15 * 60 * 1000

/** Roles eligible to receive ownership: standing members, never guests or auditors. */
const HANDOVER_ELIGIBLE_ROLES: ReadonlySet<InstitutionRole> = new Set([
  'owner',
  'workspace_admin',
  'channel_manager',
  'member',
])

export type HandoverFailure =
  | 'requester-not-owner'
  | 'requester-stale-auth'
  | 'successor-inactive'
  | 'successor-ineligible-role'
  | 'successor-is-requester'
  | 'missing-second-approval'
  | 'approver-not-owner'
  | 'approver-is-requester'

export interface HandoverApproval {
  approverDid: string
  approvedAt: string
}

export interface HandoverRequest {
  institutionId: string
  requester: InstitutionMembership
  requesterRecentAuthAt: string
  successorDid: string
  successor: InstitutionMembership | null
  /** Active owner memberships, used to validate approvers. Keyed by DID. */
  ownersByDid: ReadonlyMap<string, InstitutionMembership>
  approvals: HandoverApproval[]
  now?: Date
}

export interface HandoverValidation {
  ok: boolean
  failures: HandoverFailure[]
}

/**
 * Validate an institution ownership transfer. The transfer itself stays with
 * the caller (and the database transaction); this pins the policy: the
 * requester is an active owner with fresh authentication, the successor is an
 * active eligible member, and a second active owner — distinct from the
 * requester — approved.
 */
export function validateHandover(request: HandoverRequest): HandoverValidation {
  const now = request.now ?? new Date()
  const failures: HandoverFailure[] = []

  if (
    request.requester.institutionId !== request.institutionId ||
    request.requester.role !== 'owner' ||
    !isMembershipActive(request.requester, now)
  ) {
    failures.push('requester-not-owner')
  }

  const recentAuth = Date.parse(request.requesterRecentAuthAt)
  if (
    Number.isNaN(recentAuth) ||
    now.getTime() - recentAuth > HANDOVER_RECENT_AUTH_WINDOW_MS
  ) {
    failures.push('requester-stale-auth')
  }

  if (request.successorDid === request.requester.did) {
    failures.push('successor-is-requester')
  }
  if (
    request.successor === null ||
    request.successor.institutionId !== request.institutionId ||
    !isMembershipActive(request.successor, now)
  ) {
    failures.push('successor-inactive')
  } else if (!HANDOVER_ELIGIBLE_ROLES.has(request.successor.role)) {
    failures.push('successor-ineligible-role')
  }

  const secondApproval = request.approvals.some((approval) => {
    if (approval.approverDid === request.requester.did) return false
    const owner = request.ownersByDid.get(approval.approverDid)
    return (
      owner !== undefined &&
      owner.institutionId === request.institutionId &&
      owner.role === 'owner' &&
      isMembershipActive(owner, now)
    )
  })
  if (!secondApproval) {
    if (request.approvals.length === 0) {
      failures.push('missing-second-approval')
    } else if (
      request.approvals.every(
        (approval) => approval.approverDid === request.requester.did,
      )
    ) {
      failures.push('approver-is-requester')
    } else {
      failures.push('approver-not-owner')
    }
  }

  return { ok: failures.length === 0, failures }
}

export const INSTITUTION_ROLES: ReadonlySet<InstitutionRole> = new Set([
  'owner',
  'workspace_admin',
  'channel_manager',
  'member',
  'guest',
  'auditor',
  'records_custodian',
])

/** Type guard for role strings arriving over HTTP. */
export function isInstitutionRole(role: string): role is InstitutionRole {
  return (INSTITUTION_ROLES as ReadonlySet<string>).has(role)
}

// Role assignment.

export interface RoleAssignment {
  institutionId: string
  grantor: InstitutionMembership
  targetRole: InstitutionRole
  targetWorkspaceId: string | null
  now?: Date
}

/**
 * Whether `grantor` may assign `targetRole` in the target workspace. Owners
 * assign any role; workspace admins delegate operational roles inside their
 * own workspace only. Everything else — including self-promotion by members —
 * is denied.
 */
export function canAssignRole(assignment: RoleAssignment): boolean {
  const { grantor, institutionId, targetRole, targetWorkspaceId } = assignment
  const now = assignment.now ?? new Date()
  if (
    grantor.institutionId !== institutionId ||
    !isMembershipActive(grantor, now)
  ) {
    return false
  }
  if (grantor.role === 'owner' && grantor.workspaceId === null) {
    return true
  }
  return (
    grantor.role === 'workspace_admin' &&
    grantor.workspaceId !== null &&
    grantor.workspaceId === targetWorkspaceId &&
    (targetRole === 'channel_manager' ||
      targetRole === 'member' ||
      targetRole === 'guest')
  )
}
