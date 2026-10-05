import {
  type CommunityAuthorityEvent,
  type CommunityRole,
  deriveEffectiveAuthority,
  resolveCapabilities,
} from '@atproto/common'
import type { AtUri } from '@atproto/syntax'
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
  const snapshots = await getAuthoritySnapshots(
    db,
    communityUri,
    [subject],
    now,
  )
  return snapshots.get(subject) as AuthoritySnapshot
}

/** `getAuthoritySnapshot` for several subjects of one community at once. */
export async function getAuthoritySnapshots(
  db: Database,
  communityUri: string,
  subjects: readonly string[],
  now = Date.now(),
): Promise<Map<string, AuthoritySnapshot>> {
  const snapshots = new Map<string, AuthoritySnapshot>()
  const unique = [...new Set(subjects)]
  if (unique.length === 0) return snapshots

  const rows = await db.db
    .selectFrom('para_community_authority_event')
    .where('communityUri', '=', communityUri)
    .where('subject', 'in', unique)
    .selectAll()
    .execute()
  const eventsBySubject = new Map<string, CommunityAuthorityEvent[]>()
  for (const row of rows) {
    const events = eventsBySubject.get(row.subject) ?? []
    events.push({
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
    })
    eventsBySubject.set(row.subject, events)
  }
  for (const [subject, events] of eventsBySubject) {
    const authority = deriveEffectiveAuthority(events, now)
    snapshots.set(subject, {
      ...authority,
      capabilities: resolveCapabilities(authority.roles),
      events,
      usedLegacyFallback: false,
    })
  }

  // Subjects without authority events fall back to their legacy membership
  // record. The member writes that record themselves, so it can establish
  // membership but never a role above `member`: roles or role assignments in
  // it are ignored.
  const legacySubjects = unique.filter((subject) => !snapshots.has(subject))
  const legacyRows =
    legacySubjects.length > 0
      ? await db.db
          .selectFrom('para_community_membership')
          .where('communityUri', '=', communityUri)
          .where('creator', 'in', legacySubjects)
          .select(['creator', 'membershipState'])
          .execute()
      : []
  const legacyBySubject = new Map(
    legacyRows.map((row) => [row.creator, row.membershipState]),
  )
  for (const subject of legacySubjects) {
    const legacy = legacyBySubject.get(subject)
    const roles: CommunityRole[] = legacy === 'active' ? ['member'] : []
    snapshots.set(subject, {
      membershipState:
        legacy === 'active'
          ? 'active'
          : legacy === 'blocked'
            ? 'blocked'
            : legacy === 'removed'
              ? 'removed'
              : 'none',
      roles,
      capabilities: resolveCapabilities(roles),
      events: [],
      usedLegacyFallback: legacyBySubject.has(subject),
    })
  }
  return snapshots
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
    .select(['uri', 'version', 'action', 'basis'])
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
      event.subject === event.issuer &&
      !['removed', 'blocked', 'suspended'].includes(
        (await getAuthoritySnapshot(db, event.community, event.subject))
          .membershipState,
      )
    )
  }
  if (event.basis === 'foundingTransition') {
    if (event.issuer !== board.creator || event.subject !== board.creator) {
      return false
    }
    if (event.action === 'member.activate') return event.version === 1
    if (
      event.version !== 2 ||
      latest?.action !== 'member.activate' ||
      latest.basis !== 'foundingTransition'
    )
      return false
    if (board.governanceMode === 'hierarchical') {
      return event.action === 'owner.grant'
    }
    return event.action === 'moderator.grant' && hasNinetyDayLimit(event)
  }
  if (event.basis === 'resignation') {
    return event.action === 'moderator.resign' && event.subject === event.issuer
  }
  if (event.basis === 'ownerAppointment') {
    if (board.governanceMode !== 'hierarchical') return false
    const issuer = await getAuthoritySnapshot(db, event.community, event.issuer)
    return (
      issuer.roles.includes('owner') &&
      (event.action === 'moderator.grant' ||
        event.action === 'moderator.revoke') &&
      Boolean(event.evidence)
    )
  }
  if (event.basis === 'ownerTransfer') {
    if (board.governanceMode !== 'hierarchical' || !event.evidence) return false
    const issuer = await getAuthoritySnapshot(db, event.community, event.issuer)
    return (
      issuer.roles.includes('owner') &&
      (event.action === 'owner.grant' || event.action === 'owner.revoke')
    )
  }
  // @NOTE public decision records cannot attest their own tally verification.
  // Protected assembly authority remains closed until a trusted tally verifier exists.
  if (event.basis === 'assemblyDecision') return false
  return (
    event.basis === 'expiry' &&
    event.subject === event.issuer &&
    event.action === 'moderator.revoke'
  )
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
