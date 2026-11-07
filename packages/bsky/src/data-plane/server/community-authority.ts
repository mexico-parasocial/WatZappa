import {
  type CommunityAuthorityEvent,
  type CommunityRole,
  type EffectiveAuthority,
  deriveEffectiveAuthority,
  resolveCapabilities,
} from '@atproto/common'
import type { AtUri } from '@atproto/syntax'
import {
  accountSnapshots,
  communityAccountDid,
} from './community-membership.js'
import type { Database } from './db/index.js'

export interface AuthoritySnapshot {
  membershipState: 'none' | 'active' | 'suspended' | 'removed' | 'blocked'
  roles: CommunityRole[]
  /** The event that established each held role. */
  evidence: EffectiveAuthority['evidence']
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
  // OD-9: a community account answers from its folded chain alone.
  const accountDid = communityAccountDid(communityUri)
  if (accountDid) return accountSnapshots(db, accountDid, subjects, now)
  const resolve = await getAuthorityResolver(db, communityUri, subjects)
  return new Map(
    [...new Set(subjects)].map((subject) => [subject, resolve(subject, now)]),
  )
}

/**
 * Loads the authority inputs of several subjects of one community once, and
 * returns a function that derives a subject's snapshot at any moment. Use it
 * when snapshots are needed at different times, such as each moderation
 * action's own `indexedAt`.
 */
export async function getAuthorityResolver(
  db: Database,
  communityUri: string,
  subjects: readonly string[],
): Promise<(subject: string, at: number) => AuthoritySnapshot> {
  const unique = [...new Set(subjects)]
  const [rows, legacyRows] =
    unique.length === 0
      ? [[], []]
      : await Promise.all([
          db.db
            .selectFrom('para_community_authority_event')
            .where('communityUri', '=', communityUri)
            .where('subject', 'in', unique)
            .selectAll()
            .execute(),
          db.db
            .selectFrom('para_community_membership')
            .where('communityUri', '=', communityUri)
            .where('creator', 'in', unique)
            .select([
              'uri',
              'creator',
              'membershipState',
              'joinedAt',
              'leftAt',
              'indexedAt',
            ])
            .execute(),
        ])
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
  const legacyBySubject = new Map(legacyRows.map((row) => [row.creator, row]))

  return (subject, at) => {
    const events = eventsBySubject.get(subject) ?? []
    const legacy = legacyBySubject.get(subject)
    if (events.length === 0) {
      // The member writes the legacy record themselves, so it can establish
      // membership but never a role above `member`: roles or role
      // assignments in it are ignored.
      const state = legacy?.membershipState
      const roles: CommunityRole[] = state === 'active' ? ['member'] : []
      return {
        membershipState:
          state === 'active' || state === 'blocked' || state === 'removed'
            ? state
            : 'none',
        roles,
        evidence: {},
        capabilities: resolveCapabilities(roles),
        events: [],
        usedLegacyFallback: legacy !== undefined,
      }
    }
    // `community.join` writes only the legacy record, so a member who joined
    // that way has no activation event. An active legacy record therefore
    // opens the chain, ahead of every event: otherwise an owner's appointment
    // would become the member's only event and leave them with no membership,
    // and the grant along with it. Later suspensions, removals and blocks in
    // the chain still override it.
    const opening: CommunityAuthorityEvent[] =
      legacy?.membershipState === 'active'
        ? [legacyActivation(communityUri, subject, legacy, at)]
        : []
    const authority = deriveEffectiveAuthority([...opening, ...events], at)
    if (
      authority.membershipState === 'active' &&
      legacy?.membershipState === 'left' &&
      leftBeforeRejoining(legacy, events, at)
    ) {
      return {
        membershipState: 'none',
        roles: [],
        evidence: {},
        capabilities: resolveCapabilities([]),
        events,
        usedLegacyFallback: true,
      }
    }
    return {
      ...authority,
      capabilities: resolveCapabilities(authority.roles),
      events,
      usedLegacyFallback: opening.length > 0,
    }
  }
}

/**
 * `community.leave` only rewrites the legacy record, so a member whose chain
 * holds an activation would otherwise stay active, offices included. A `left`
 * record ends an active membership once it applies, unless an activation or
 * reinstatement became effective after it. It never ends a suspension,
 * removal or block: those stay as the chain says.
 *
 * The leave applies from `leftAt`, but never before the record was indexed,
 * so a member cannot backdate it to void their own past moderation. Rejoining
 * rewrites the record and so forgets the leave: offices that were never
 * revoked return with the membership. Ending them for good needs a leave
 * event in the chain.
 */
function leftBeforeRejoining(
  legacy: { leftAt: string | null; indexedAt: string },
  events: readonly CommunityAuthorityEvent[],
  at: number,
) {
  const leftAt = legacyLeftAt(legacy)
  if (!Number.isFinite(leftAt) || leftAt > at) return false
  return !events.some((event) => {
    if (
      event.action !== 'member.activate' &&
      event.action !== 'member.reinstate'
    )
      return false
    const effectiveAt = Date.parse(event.effectiveAt)
    return effectiveAt > leftAt && effectiveAt <= at
  })
}

/** When a `left` legacy record takes effect; see `leftBeforeRejoining`. */
function legacyLeftAt(legacy: { leftAt: string | null; indexedAt: string }) {
  const indexedAt = Date.parse(legacy.indexedAt)
  const leftAt = legacy.leftAt ? Date.parse(legacy.leftAt) : NaN
  return Number.isFinite(leftAt) ? Math.max(leftAt, indexedAt) : indexedAt
}

/**
 * Keeps the rows whose author held one of `offices` in the row's community
 * when the AppView indexed the row. Use it for any record that changes what
 * other accounts see in a community: anyone can write such a record into
 * their own repo, and `indexedAt` is the one time its author cannot choose.
 */
export async function filterByOfficeWhenIndexed<T>(
  db: Database,
  rows: readonly T[],
  of: (row: T) => { community: string; author: string; indexedAt: string },
  offices: readonly CommunityRole[],
): Promise<T[]> {
  // @NOTE an OD-9 community account takes such decisions only as events in
  // its own chain (phase 4), so a member's record never counts for one.
  rows = rows.filter((row) => !communityAccountDid(of(row).community))
  const authorsByCommunity = new Map<string, Set<string>>()
  for (const row of rows) {
    const { community, author } = of(row)
    const authors = authorsByCommunity.get(community) ?? new Set()
    authors.add(author)
    authorsByCommunity.set(community, authors)
  }
  const resolvers = new Map(
    await Promise.all(
      [...authorsByCommunity].map(
        async ([community, authors]) =>
          [
            community,
            await getAuthorityResolver(db, community, [...authors]),
          ] as const,
      ),
    ),
  )
  return rows.filter((row) => {
    const { community, author, indexedAt } = of(row)
    const resolve = resolvers.get(community)
    const at = Date.parse(indexedAt)
    if (!resolve || !Number.isFinite(at)) return false
    const { roles } = resolve(author, at)
    return offices.some((office) => roles.includes(office))
  })
}

/**
 * The legacy membership record as an implicit `member.activate` at version 0.
 * Effective from `joinedAt`, capped at `at`: the record's own clock may run
 * ahead of the AppView's, and the legacy-only path above never consulted it.
 */
function legacyActivation(
  community: string,
  subject: string,
  legacy: { uri: string; joinedAt: string },
  at: number,
): CommunityAuthorityEvent {
  const joinedAt = Date.parse(legacy.joinedAt)
  return {
    uri: legacy.uri,
    creator: subject,
    community,
    subject,
    action: 'member.activate',
    issuer: subject,
    effectiveAt:
      Number.isFinite(joinedAt) && joinedAt <= at
        ? legacy.joinedAt
        : new Date(at).toISOString(),
    version: 0,
    basis: 'migration',
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
