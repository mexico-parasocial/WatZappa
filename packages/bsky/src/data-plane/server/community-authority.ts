import {
  ASSEMBLY_APPROVE_OPTION,
  ASSEMBLY_DECISIONS,
  ASSEMBLY_MIN_VOTING_MS,
  ASSEMBLY_OPTION_COUNT,
  ASSEMBLY_REJECT_OPTION,
  type AssemblyOutcome,
  type CommunityAuthorityEvent,
  type CommunityRole,
  type EffectiveAuthority,
  deriveEffectiveAuthority,
  evaluateAssemblyVote,
  resolveCapabilities,
} from '@atproto/common'
import { AtUri } from '@atproto/syntax'
import {
  accountSnapshots,
  communityAccountDid,
} from './community-membership.js'
import type { Database } from './db/index.js'
import {
  type ProtectedActionClaim,
  readProtectedAction,
} from './protected-action.js'

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

/** Rows per `in (...)` list, well under the 65535 bind parameters Postgres allows. */
const SNAPSHOT_CHUNK = 5000

/**
 * Which of `dids` are active members of the community: by authority events,
 * and for a DID with none by its own membership record (see
 * `getAuthoritySnapshots`). The one rule for "may this account vote here",
 * shared by ballot indexing, tallies and delegations.
 */
export async function filterActiveMembers(
  db: Database,
  communityUri: string,
  dids: readonly string[],
  now = Date.now(),
): Promise<Set<string>> {
  const unique = [...new Set(dids)]
  const active = new Set<string>()
  for (let i = 0; i < unique.length; i += SNAPSHOT_CHUNK) {
    const snapshots = await getAuthoritySnapshots(
      db,
      communityUri,
      unique.slice(i, i + SNAPSHOT_CHUNK),
      now,
    )
    for (const [did, snapshot] of snapshots) {
      if (snapshot.membershipState === 'active') active.add(did)
    }
  }
  return active
}

/**
 * Every account that is an active member of the community by
 * `filterActiveMembers`: anyone with an authority event, plus anyone with a
 * membership record, judged by the same rule. Counting `membershipState`
 * straight from the records would count what members say about themselves.
 */
export async function listActiveMembers(
  db: Database,
  communityUri: string,
  now = Date.now(),
): Promise<Set<string>> {
  // OD-9: a community account's members are its folded chain's.
  const accountDid = communityAccountDid(communityUri)
  if (accountDid) {
    const rows = await db.db
      .selectFrom('para_community_member_state')
      .where('community', '=', accountDid)
      .select('did')
      .execute()
    return filterActiveMembers(
      db,
      communityUri,
      rows.map((row) => row.did),
      now,
    )
  }
  const [events, records] = await Promise.all([
    db.db
      .selectFrom('para_community_authority_event')
      .where('communityUri', '=', communityUri)
      .select('subject as did')
      .distinct()
      .execute(),
    db.db
      .selectFrom('para_community_membership')
      .where('communityUri', '=', communityUri)
      .select('creator as did')
      .distinct()
      .execute(),
  ])
  return filterActiveMembers(
    db,
    communityUri,
    [...events, ...records].map((row) => row.did),
    now,
  )
}

/**
 * The assembly: accounts that are active members by authority events alone,
 * as of `at`. A membership record an account wrote itself never counts here,
 * because this set decides who holds authority.
 */
export async function getAuthorityElectorate(
  db: Database,
  communityUri: string,
  at = Date.now(),
): Promise<Set<string>> {
  const rows = await db.db
    .selectFrom('para_community_authority_event')
    .where('communityUri', '=', communityUri)
    .select('subject')
    .distinct()
    .execute()
  return filterActiveMembers(
    db,
    communityUri,
    rows.map((row) => row.subject),
    at,
  )
}

const CABILDEO_COLLECTION = 'com.para.civic.cabildeo'

/** Why a cabildeo cannot ground an authority event (as far as it can be told without an event). */
export type AssemblyProblem =
  | 'unknown-cabildeo'
  | 'not-resolved'
  | 'wrong-community'
  | 'record-changed'
  | 'too-short'
  | 'not-decidable'
  | 'options'

type AssemblyAssessment =
  | { ok: false; problem: AssemblyProblem }
  | {
      ok: true
      claim: ProtectedActionClaim
      rule: (typeof ASSEMBLY_DECISIONS)[string]
      closedAt: number
      outcome: AssemblyOutcome
      /** The authority event this cabildeo already grounds, if any. */
      spentBy: string | null
    }

/**
 * What the assembly decided in a cabildeo, read from the AppView's own index of
 * it, never from what an event or the cabildeo's author says:
 *
 * - the cabildeo belongs to this community (by its board URI, not by a slug
 *   that another board could share), carries a `protectedAction` an assembly
 *   may decide, and is still the record version in which voting opened, so the
 *   claim cannot change after ballots are cast;
 * - it closed with a final tally, and the ballots counted are those of
 *   accounts that were active members by authority events when it closed;
 * - the ballots meet the quorum and threshold of the action's policy
 *   (`evaluateAssemblyVote`).
 */
async function assessCabildeoAssembly(
  db: Database,
  cabildeoUri: string,
  communityUri: string,
): Promise<AssemblyAssessment> {
  const [cabildeo, source, closePolicy, tally, spent] = await Promise.all([
    db.db
      .selectFrom('cabildeo_cabildeo')
      .where('uri', '=', cabildeoUri)
      .select(['community', 'minQuorum'])
      .executeTakeFirst(),
    db.db
      .selectFrom('record')
      .where('uri', '=', cabildeoUri)
      .select(['cid', 'json'])
      .executeTakeFirst(),
    db.db
      .selectFrom('cabildeo_close_policy')
      .where('cabildeo', '=', cabildeoUri)
      .select(['recordCid', 'openedAt'])
      .executeTakeFirst(),
    db.db
      .selectFrom('cabildeo_final_tally')
      .where('cabildeo', '=', cabildeoUri)
      .select(['closedAt', 'acceptedInputs'])
      .executeTakeFirst(),
    db.db
      .selectFrom('para_community_authority_event')
      .where('evidence', '=', cabildeoUri)
      .select('uri')
      .executeTakeFirst(),
  ])
  if (!cabildeo || !source) return { ok: false, problem: 'unknown-cabildeo' }
  if (!tally) return { ok: false, problem: 'not-resolved' }
  if (cabildeo.community !== communityUri) {
    return { ok: false, problem: 'wrong-community' }
  }
  if (!closePolicy?.recordCid || closePolicy.recordCid !== source.cid) {
    return { ok: false, problem: 'record-changed' }
  }

  let record: { protectedAction?: unknown; options?: unknown }
  try {
    record = JSON.parse(source.json)
  } catch {
    return { ok: false, problem: 'unknown-cabildeo' }
  }
  const claim = readProtectedAction(record.protectedAction)
  const rule = claim && ASSEMBLY_DECISIONS[claim.action]
  if (!claim || !rule) return { ok: false, problem: 'not-decidable' }
  if (
    !Array.isArray(record.options) ||
    record.options.length !== ASSEMBLY_OPTION_COUNT
  ) {
    return { ok: false, problem: 'options' }
  }

  const closedAt = Date.parse(tally.closedAt)
  const ballots = (tally.acceptedInputs as { ballots?: unknown } | null)
    ?.ballots
  if (!Number.isFinite(closedAt) || !Array.isArray(ballots)) {
    return { ok: false, problem: 'not-resolved' }
  }
  // Voting must have stayed open long enough to be heard. `openedAt` is when
  // the AppView first saw the cabildeo in voting, not a date its author wrote.
  const openedAt = Date.parse(closePolicy.openedAt)
  if (
    !Number.isFinite(openedAt) ||
    closedAt - openedAt < ASSEMBLY_MIN_VOTING_MS
  ) {
    return { ok: false, problem: 'too-short' }
  }

  const electorate = await getAuthorityElectorate(db, communityUri, closedAt)
  const choices = new Map<string, number>()
  for (const ballot of ballots as Array<Record<string, unknown>>) {
    if (
      typeof ballot?.actorDid === 'string' &&
      typeof ballot.selectedOption === 'number' &&
      electorate.has(ballot.actorDid)
    ) {
      choices.set(ballot.actorDid, ballot.selectedOption)
    }
  }
  const counted = [...choices.values()]
  return {
    ok: true,
    claim,
    rule,
    closedAt,
    spentBy: spent?.uri ?? null,
    outcome: evaluateAssemblyVote({
      policy: rule.policy,
      electorate: electorate.size,
      approvals: counted.filter((o) => o === ASSEMBLY_APPROVE_OPTION).length,
      rejections: counted.filter((o) => o === ASSEMBLY_REJECT_OPTION).length,
      minQuorum: cabildeo.minQuorum,
    }),
  }
}

/**
 * Whether the assembly really decided this authority event: the evidence is a
 * `com.para.civic.cabildeo` whose claim names exactly this subject and an event
 * the action may produce, whose tally passes (`assessCabildeoAssembly`), and
 * which grounds one event only.
 */
async function verifyAssemblyDecision(
  db: Database,
  event: Omit<CommunityAuthorityEvent, 'uri' | 'creator'>,
  board: { admissionMode: string },
): Promise<boolean> {
  if (!event.evidence) return false
  let evidence: AtUri
  try {
    evidence = new AtUri(event.evidence)
  } catch {
    return false
  }
  if (evidence.collection !== CABILDEO_COLLECTION || !evidence.rkey) {
    return false
  }
  // Only the canonical spelling: `.../rkey/` parses to the same cabildeo but is
  // a different string, and "one cabildeo grounds one event" compares strings.
  const cabildeoUri = evidence.toString()
  if (cabildeoUri !== event.evidence) return false

  const assessment = await assessCabildeoAssembly(
    db,
    cabildeoUri,
    event.community,
  )
  if (!assessment.ok || assessment.spentBy) return false
  const { claim, rule, closedAt, outcome } = assessment
  if (!rule.events.includes(event.action) || claim.subject !== event.subject) {
    return false
  }
  if (Date.parse(event.effectiveAt) < closedAt) return false

  if (event.action === 'member.activate') {
    // Only a gated community admits by assembly; an open one has no gate.
    if (board.admissionMode !== 'assembly_approval') return false
    const current = await getAuthoritySnapshot(
      db,
      event.community,
      event.subject,
    )
    if (['removed', 'blocked', 'suspended'].includes(current.membershipState)) {
      return false
    }
  }
  return outcome.approved
}

/**
 * What a client shows for a resolved cabildeo that carries a `protectedAction`,
 * and the authority event it may publish when the assembly approved. Never
 * authoritative: `verifyAuthorityEvent` decides again when the event arrives.
 */
export type AssemblyDecisionView = {
  problem?: AssemblyProblem | 'not-admissible'
  action?: string
  subject?: string
  policy?: 'assembly_majority' | 'assembly_supermajority'
  outcome?: AssemblyOutcome
  /** The event to publish: the next link in the subject's chain. */
  event?: {
    action: CommunityAuthorityEvent['action']
    subject: string
    version: number
    predecessor?: string
    evidence: string
  }
  /** The authority event this cabildeo already grounds. */
  appliedEvent?: string
}

export async function getAssemblyDecisionView(
  db: Database,
  cabildeoUri: string,
  communityUri: string,
): Promise<AssemblyDecisionView> {
  // The community must be a board's URI, as in an event's `community`.
  const board = await db.db
    .selectFrom('para_community_board')
    .where('uri', '=', communityUri)
    .select('admissionMode')
    .executeTakeFirst()
  if (!board) return { problem: 'wrong-community' }
  const assessment = await assessCabildeoAssembly(db, cabildeoUri, communityUri)
  if (!assessment.ok) return { problem: assessment.problem }
  const { claim, rule, outcome, spentBy } = assessment
  const view: AssemblyDecisionView = {
    action: claim.action,
    subject: claim.subject,
    policy: rule.policy,
    outcome,
  }
  if (spentBy) return { ...view, appliedEvent: spentBy }
  if (!outcome.approved) return view

  const subject = await getAuthoritySnapshot(db, communityUri, claim.subject)
  let action: CommunityAuthorityEvent['action']
  if (claim.action === 'membership.approve') {
    if (
      board.admissionMode !== 'assembly_approval' ||
      ['removed', 'blocked', 'suspended'].includes(subject.membershipState)
    ) {
      return { ...view, problem: 'not-admissible' }
    }
    action = 'member.activate'
  } else {
    action = subject.roles.includes('owner') ? 'owner.revoke' : 'owner.grant'
  }
  const head = await db.db
    .selectFrom('para_community_authority_event')
    .where('communityUri', '=', communityUri)
    .where('subject', '=', claim.subject)
    .orderBy('version', 'desc')
    .orderBy('id', 'desc')
    .select(['uri', 'version'])
    .executeTakeFirst()
  return {
    ...view,
    event: {
      action,
      subject: claim.subject,
      version: (head?.version ?? 0) + 1,
      ...(head ? { predecessor: head.uri } : {}),
      evidence: cabildeoUri,
    },
  }
}

/** The latest authority event of each subject: what its next event chains to. */
export async function getAuthorityHeads(
  db: Database,
  communityUri: string,
  subjects: readonly string[],
): Promise<Map<string, { uri: string; version: number }>> {
  const heads = new Map<string, { uri: string; version: number }>()
  const unique = [...new Set(subjects)]
  if (unique.length === 0) return heads
  const rows = await db.db
    .selectFrom('para_community_authority_event')
    .where('communityUri', '=', communityUri)
    .where('subject', 'in', unique)
    .select(['subject', 'uri', 'version', 'id'])
    .orderBy('version', 'asc')
    .orderBy('id', 'asc')
    .execute()
  for (const row of rows) {
    heads.set(row.subject, { uri: row.uri, version: row.version })
  }
  return heads
}

export interface PendingRoleOffer {
  uri: string
  role: string
  subject: string
  offeredBy: string
  createdAt: string
  acceptanceUri?: string
  acceptedAt?: string
  subjectEventUri: string
  subjectEventVersion: number
}

/** Newest offers considered per community, so the read stays bounded. */
const PENDING_OFFER_LIMIT = 100

/**
 * Offers still waiting: made by a current owner, and not yet carried out by an
 * appointment that cites their acceptance. Each carries the member's latest
 * authority event, which the appointment names as its predecessor.
 */
export async function listPendingRoleOffers(
  db: Database,
  communityUri: string,
  owners: ReadonlySet<string>,
): Promise<PendingRoleOffer[]> {
  if (owners.size === 0) return []
  const offers = await db.db
    .selectFrom('para_community_role_offer')
    .where('communityUri', '=', communityUri)
    .where('creator', 'in', [...owners])
    .selectAll()
    .orderBy('createdAt', 'desc')
    .orderBy('uri', 'desc')
    .limit(PENDING_OFFER_LIMIT)
    .execute()
  if (offers.length === 0) return []
  const acceptances = await db.db
    .selectFrom('para_community_role_acceptance')
    .where(
      'offerUri',
      'in',
      offers.map((offer) => offer.uri),
    )
    .selectAll()
    .execute()
  const acceptanceByOffer = new Map(
    acceptances.map((acceptance) => [acceptance.offerUri, acceptance]),
  )
  const used = acceptances.length
    ? await db.db
        .selectFrom('para_community_authority_event')
        .where(
          'evidence',
          'in',
          acceptances.map((acceptance) => acceptance.uri),
        )
        .select('evidence')
        .execute()
    : []
  const consumed = new Set(used.map((row) => row.evidence))
  const heads = await getAuthorityHeads(
    db,
    communityUri,
    offers.map((offer) => offer.subject),
  )
  return offers.flatMap((offer) => {
    const acceptance = acceptanceByOffer.get(offer.uri)
    if (acceptance && consumed.has(acceptance.uri)) return []
    const head = heads.get(offer.subject)
    if (!head) return []
    return [
      {
        uri: offer.uri,
        role: offer.role,
        subject: offer.subject,
        offeredBy: offer.creator,
        createdAt: offer.createdAt,
        ...(acceptance
          ? { acceptanceUri: acceptance.uri, acceptedAt: acceptance.createdAt }
          : {}),
        subjectEventUri: head.uri,
        subjectEventVersion: head.version,
      },
    ]
  })
}

/**
 * Whether `event` (a `moderator.grant` by `ownerAppointment`) rests on a real
 * acceptance. The member published the acceptance themselves, for an offer
 * from the same owner, in this community, for this role; and an acceptance
 * grounds one appointment only, so it cannot be replayed after a revocation.
 */
async function verifyRoleAcceptance(
  db: Database,
  event: Omit<CommunityAuthorityEvent, 'uri' | 'creator'>,
): Promise<boolean> {
  if (!event.evidence) return false
  const acceptance = await db.db
    .selectFrom('para_community_role_acceptance')
    .where('uri', '=', event.evidence)
    .selectAll()
    .executeTakeFirst()
  if (
    !acceptance ||
    acceptance.role !== 'moderator' ||
    acceptance.communityUri !== event.community ||
    acceptance.subject !== event.subject ||
    acceptance.creator !== event.subject
  ) {
    return false
  }
  const offer = await db.db
    .selectFrom('para_community_role_offer')
    .where('uri', '=', acceptance.offerUri)
    .selectAll()
    .executeTakeFirst()
  if (
    !offer ||
    offer.role !== 'moderator' ||
    offer.communityUri !== event.community ||
    offer.subject !== event.subject ||
    offer.creator !== event.issuer
  ) {
    return false
  }
  const used = await db.db
    .selectFrom('para_community_authority_event')
    .where('evidence', '=', event.evidence)
    .select('id')
    .executeTakeFirst()
  return !used
}

/**
 * A revocation names the appointment it ends: the `moderator.grant` itself, or
 * the evidence that grant cited (what `getGovernance` lists for the holder).
 */
async function verifyRevokedAppointment(
  db: Database,
  event: Omit<CommunityAuthorityEvent, 'uri' | 'creator'>,
): Promise<boolean> {
  const named = event.evidence
  if (!named) return false
  const appointment = await db.db
    .selectFrom('para_community_authority_event')
    .where('communityUri', '=', event.community)
    .where('subject', '=', event.subject)
    .where('action', '=', 'moderator.grant')
    .where((eb) => eb.or([eb('uri', '=', named), eb('evidence', '=', named)]))
    .select('id')
    .executeTakeFirst()
  return Boolean(appointment)
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
    .select(['creator', 'admissionMode'])
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
    return event.action === 'owner.grant'
  }
  if (event.basis === 'resignation') {
    return event.action === 'moderator.resign' && event.subject === event.issuer
  }
  if (event.basis === 'ownerAppointment') {
    const issuer = await getAuthoritySnapshot(db, event.community, event.issuer)
    if (!issuer.roles.includes('owner')) return false
    if (event.action === 'moderator.revoke') {
      return verifyRevokedAppointment(db, event)
    }
    if (event.action !== 'moderator.grant') return false
    const subject = await getAuthoritySnapshot(
      db,
      event.community,
      event.subject,
    )
    return (
      subject.membershipState === 'active' &&
      (await verifyRoleAcceptance(db, event))
    )
  }
  if (event.basis === 'ownerTransfer') {
    if (!event.evidence) return false
    const issuer = await getAuthoritySnapshot(db, event.community, event.issuer)
    return (
      issuer.roles.includes('owner') &&
      (event.action === 'owner.grant' || event.action === 'owner.revoke')
    )
  }
  // @NOTE a record cannot attest its own tally: the assembly's decision is
  // recomputed here from the cabildeo's final tally (`verifyAssemblyDecision`).
  if (event.basis === 'assemblyDecision') {
    return verifyAssemblyDecision(db, event, board)
  }
  return (
    event.basis === 'expiry' &&
    event.subject === event.issuer &&
    event.action === 'moderator.revoke'
  )
}
