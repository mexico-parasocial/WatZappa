import {
  ASSEMBLY_APPROVE_OPTION,
  ASSEMBLY_DECISIONS,
  ASSEMBLY_MIN_VOTING_MS,
  ASSEMBLY_OPTION_COUNT,
  ASSEMBLY_REJECT_OPTION,
  type AssemblyOutcome,
  type CommunityAuthorityEvent,
  type CommunityRole,
  deriveEffectiveAuthority,
  evaluateAssemblyVote,
  resolveCapabilities,
} from '@atproto/common'
import { AtUri } from '@atproto/syntax'
import type { Database } from './db/index.js'
import {
  type ProtectedActionClaim,
  readProtectedAction,
} from './protected-action.js'

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
    return (
      issuer.roles.includes('owner') &&
      (event.action === 'moderator.grant' ||
        event.action === 'moderator.revoke') &&
      Boolean(event.evidence)
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
