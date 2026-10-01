import { lexParse } from '@atproto/lex'
import {
  type CommunityAuthorityEvent,
  type CommunityRole,
  deriveEffectiveAuthority,
  resolveCapabilities,
} from '@atproto/common'
import { AtUri } from '@atproto/syntax'
import type { Database } from './db/index.js'

export interface AuthoritySnapshot {
  membershipState: 'none' | 'active' | 'suspended' | 'removed' | 'blocked'
  roles: CommunityRole[]
  capabilities: string[]
  events: CommunityAuthorityEvent[]
  usedLegacyFallback: boolean
}

export async function getAuthoritySnapshot(
  db: Database,
  communityUri: string,
  subject: string,
  now = Date.now(),
): Promise<AuthoritySnapshot> {
  const rows = await db.db
    .selectFrom('para_community_authority_event')
    .where('communityUri', '=', communityUri)
    .where('subject', '=', subject)
    .selectAll()
    .execute()
  const events: CommunityAuthorityEvent[] = rows.map((row) => ({
    uri: row.uri,
    creator: row.creator,
    community: row.communityUri,
    subject: row.subject,
    action: row.action as CommunityAuthorityEvent['action'],
    issuer: row.issuer,
    effectiveAt: row.effectiveAt,
    expiresAt: row.expiresAt,
    predecessor: row.predecessor,
    version: row.version,
    basis: row.basis as CommunityAuthorityEvent['basis'],
    evidence: row.evidence,
  }))
  if (events.length > 0) {
    const authority = deriveEffectiveAuthority(events, now)
    return {
      ...authority,
      capabilities: resolveCapabilities(authority.roles),
      events,
      usedLegacyFallback: false,
    }
  }

  const legacy = await db.db
    .selectFrom('para_community_membership')
    .where('communityUri', '=', communityUri)
    .where('creator', '=', subject)
    .select(['membershipState', 'roles', 'roleAssignments', 'uri', 'joinedAt'])
    .executeTakeFirst()
  const roles: CommunityRole[] = []
  if (legacy?.membershipState === 'active') {
    roles.push('member')
    const legacyRoles = validLegacyRoles(
      legacy.roles,
      legacy.roleAssignments,
      now,
    )
    if (legacyRoles.includes('moderator')) roles.push('moderator')
    if (legacyRoles.includes('owner')) roles.push('owner')
  }
  return {
    membershipState:
      legacy?.membershipState === 'active'
        ? 'active'
        : legacy?.membershipState === 'blocked'
          ? 'blocked'
          : legacy?.membershipState === 'removed'
            ? 'removed'
            : 'none',
    roles,
    capabilities: resolveCapabilities(roles),
    events: [],
    usedLegacyFallback: Boolean(legacy),
  }
}

export async function verifyAuthorityEvent(
  db: Database,
  uri: AtUri,
  event: Omit<CommunityAuthorityEvent, 'uri' | 'creator'>,
): Promise<boolean> {
  if (event.version < 1 || event.issuer !== uri.host) return false
  if (event.basis === 'migration') return false
  const board = await db.db
    .selectFrom('para_community_board')
    .where('uri', '=', event.community)
    .select(['creator', 'governanceMode', 'admissionMode'])
    .executeTakeFirst()
  if (!board) return false

  const latest = await db.db
    .selectFrom('para_community_authority_event')
    .where('communityUri', '=', event.community)
    .where('subject', '=', event.subject)
    .orderBy('version', 'desc')
    .orderBy('id', 'desc')
    .select(['uri', 'version'])
    .executeTakeFirst()
  if (latest) {
    if (event.version !== latest.version + 1) return false
    if (event.predecessor !== latest.uri) return false
  } else if (event.version !== 1 || event.predecessor) {
    return false
  }

  const isMemberActivation = event.action === 'member.activate'
  if (event.basis === 'openAdmission') {
    return (
      isMemberActivation &&
      board.admissionMode === 'open' &&
      event.subject === event.issuer
    )
  }
  if (event.basis === 'foundingTransition') {
    if (event.issuer !== board.creator || event.subject !== board.creator) {
      return false
    }
    if (event.action === 'member.activate') return true
    if (board.governanceMode === 'hierarchical') {
      return event.action === 'owner.grant'
    }
    return event.action === 'moderator.grant' && hasNinetyDayLimit(event)
  }
  if (event.basis === 'resignation') {
    return (
      event.action === 'moderator.resign' && event.subject === event.issuer
    )
  }
  if (event.basis === 'ownerAppointment') {
    if (board.governanceMode !== 'hierarchical') return false
    const issuer = await getAuthoritySnapshot(
      db,
      event.community,
      event.issuer,
    )
    return (
      issuer.roles.includes('owner') &&
      (event.action === 'moderator.grant' ||
        event.action === 'moderator.revoke') &&
      Boolean(event.evidence)
    )
  }
  if (event.basis === 'ownerTransfer') {
    if (board.governanceMode !== 'hierarchical' || !event.evidence) return false
    const issuer = await getAuthoritySnapshot(
      db,
      event.community,
      event.issuer,
    )
    return (
      issuer.roles.includes('owner') &&
      (event.action === 'owner.grant' || event.action === 'owner.revoke')
    )
  }
  if (event.basis === 'assemblyDecision') {
    return verifyDecisionEvidence(db, event)
  }
  return event.basis === 'expiry' && event.subject === event.issuer
}

async function verifyDecisionEvidence(
  db: Database,
  event: Omit<CommunityAuthorityEvent, 'uri' | 'creator'>,
) {
  if (!event.evidence) return false
  let evidence: AtUri
  try {
    evidence = new AtUri(event.evidence)
  } catch {
    return false
  }
  if (evidence.collection !== 'com.para.community.decision') return false
  const stored = await db.db
    .selectFrom('record')
    .where('uri', '=', event.evidence)
    .select(['json'])
    .executeTakeFirst()
  if (!stored) return false
  const decision = lexParse(stored.json) as Record<string, unknown>
  if (
    decision.community !== event.community ||
    decision.result !== 'approved' ||
    !decision.verifiedAt ||
    !decision.proposalCid
  ) {
    return false
  }
  const protectedAction = decision.protectedAction as
    | Record<string, unknown>
    | undefined
  if (!protectedAction || protectedAction.subject !== event.subject) return false
  const expected = new Map<string, string[]>([
    ['member.activate', ['membership.approve']],
    ['member.remove', ['member.remove']],
    ['member.block', ['member.block']],
    ['moderator.grant', ['moderator.elect']],
    ['moderator.revoke', ['moderator.recall']],
    ['owner.grant', ['owner.recover']],
  ])
  if (!expected.get(event.action)?.includes(String(protectedAction.action))) {
    return false
  }
  return event.action !== 'moderator.grant' || hasNinetyDayLimit(event)
}

function hasNinetyDayLimit(
  event: Omit<CommunityAuthorityEvent, 'uri' | 'creator'>,
) {
  if (!event.expiresAt) return false
  const effective = Date.parse(event.effectiveAt)
  const expires = Date.parse(event.expiresAt)
  return (
    Number.isFinite(effective) &&
    Number.isFinite(expires) &&
    expires > effective &&
    expires - effective <= 90 * 24 * 60 * 60 * 1000
  )
}

function validLegacyRoles(
  roles: string[] | null,
  assignments: Record<string, unknown>[] | null,
  now: number,
) {
  if (!assignments?.length) return roles ?? []
  return assignments.flatMap((assignment) => {
    const start = assignment.validFrom
      ? Date.parse(String(assignment.validFrom))
      : 0
    const end = assignment.validUntil
      ? Date.parse(String(assignment.validUntil))
      : Infinity
    return start <= now && end > now && typeof assignment.role === 'string'
      ? [assignment.role]
      : []
  })
}
