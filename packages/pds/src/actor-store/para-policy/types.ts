/** Current membership states indexed by PARA's community control plane. */
export type ParaPolicyMembershipState =
  'pending' | 'active' | 'left' | 'removed' | 'blocked'

export type ParaPolicyProjectionKind = 'snapshot' | 'patch'

export type ParaPolicyRoleAssignment = {
  role: string
  validFrom?: string
  validUntil?: string
  ratifiedBy?: string
}

export type ParaPolicyMember = {
  space: string
  did: string
  membershipState: ParaPolicyMembershipState
  roles: string[]
  roleAssignments: ParaPolicyRoleAssignment[]
  sourceVersion: number
  updatedAt: string
}

export type ParaPolicyMemberInput = {
  did: string
  membershipState: ParaPolicyMembershipState
  roles?: string[]
  roleAssignments?: ParaPolicyRoleAssignment[]
}

/**
 * A verified, ordered control-plane delta. Signature verification is deliberately
 * outside storage; callers can persist only the material that verifier accepted.
 */
export type ParaPolicyProjectionDelta = {
  /** A snapshot replaces the member materialization; a patch changes named rows. */
  kind: ParaPolicyProjectionKind
  space: string
  sourceUri: string
  sourceCid: string
  sourceIssuer: string
  sourceVersion: number
  policyEpoch: number
  /** Digest of the preceding accepted projection, or null for a bootstrap snapshot. */
  previousDeltaDigest: string | null
  issuedAt: string
  signedDelta: string
  members: ParaPolicyMemberInput[]
}

/**
 * Match PARA's existing community semantics: structured assignments, when
 * present, supersede the legacy flat roles array and are effective only during
 * their declared time bounds.
 */
export const getEffectiveParaPolicyRoles = (
  member: Pick<ParaPolicyMember, 'roles' | 'roleAssignments'>,
  now = Date.now(),
): string[] => {
  if (member.roleAssignments.length === 0) return member.roles

  return member.roleAssignments
    .filter((assignment) => {
      if (assignment.validFrom && Date.parse(assignment.validFrom) > now) {
        return false
      }
      if (assignment.validUntil && Date.parse(assignment.validUntil) <= now) {
        return false
      }
      return true
    })
    .map((assignment) => assignment.role)
}
