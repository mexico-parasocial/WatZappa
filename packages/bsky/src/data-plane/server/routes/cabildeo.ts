import { Code, ConnectError, ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import { Service } from '../../../proto/bsky_connect.js'
import {
  LIVE_CABILDEO_ALLOWED_PHASES,
  activeHostPresenceExistsSql,
  getActiveLiveSession,
  getLiveSessionSummary,
  isLiveCabildeoPhase,
  presenceExpiry,
} from '../cabildeo-live.js'
import { Database } from '../db/index.js'
import { TimeCidKeyset, paginate } from '../db/pagination.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaCabildeos(req) {
    const { ref } = db.db.dynamic
    const normalizedCommunity = normalizeCommunity(req.community)
    const phase = req.phase?.trim()
    const now = new Date()

    const activeLiveSql = sql<boolean>`(
      "cabildeo_cabildeo"."phase" in (${sql.join(
        LIVE_CABILDEO_ALLOWED_PHASES.map((item) => sql`${item}`),
        sql`, `,
      )})
      and exists (
        select 1
        from cabildeo_live_session as live_session
        where live_session.cabildeo = "cabildeo_cabildeo"."uri"
          and live_session."endedAt" is null
          and ${activeHostPresenceExistsSql('live_session', now)}
      )
    )`
    const sortRankSql = sql<string>`case
      when ${activeLiveSql}
        then to_char(
          "cabildeo_cabildeo"."sortAt"::timestamptz + interval '100 years',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      else "cabildeo_cabildeo"."sortAt"
    end`

    let builder = db.db
      .selectFrom('cabildeo_cabildeo')
      .selectAll()
      .select(sortRankSql.as('sortRank'))

    if (normalizedCommunity) {
      builder = builder.where(
        sql`lower(regexp_replace(coalesce("community", ''), '^p/', ''))`,
        '=',
        normalizedCommunity,
      )
    }
    if (phase) {
      builder = builder.where('phase', '=', phase)
    }

    const keyset = new RankedTimeCidKeyset(
      sortRankSql,
      ref('cabildeo_cabildeo.cid'),
    )

    builder = paginate(builder, {
      limit: req.limit,
      cursor: req.cursor,
      keyset,
      tryIndex: true,
    })

    const rows = await builder.execute()
    const views = await Promise.all(
      rows.map((row) =>
        mapCabildeoRow(db, row, req.viewerDid || undefined, now),
      ),
    )

    return {
      itemsJson: JSON.stringify(views),
      cursor: keyset.packFromResult(rows),
    }
  },

  async getParaCabildeo(req) {
    const now = new Date()
    const row = await db.db
      .selectFrom('cabildeo_cabildeo')
      .where('uri', '=', req.cabildeoUri)
      .selectAll()
      .executeTakeFirst()

    if (!row) {
      return {}
    }

    return {
      cabildeoJson: JSON.stringify(
        await mapCabildeoRow(db, row, req.viewerDid || undefined, now),
      ),
    }
  },

  async getParaCabildeoPositions(req) {
    const { ref } = db.db.dynamic
    let builder = db.db
      .selectFrom('cabildeo_position')
      .where('cabildeo', '=', req.cabildeoUri)
      .selectAll()

    if (req.stance) {
      builder = builder.where('stance', '=', req.stance)
    }

    const keyset = new TimeCidKeyset(
      ref('cabildeo_position.sortAt'),
      ref('cabildeo_position.cid'),
    )

    builder = paginate(builder, {
      limit: req.limit,
      cursor: req.cursor,
      keyset,
      tryIndex: true,
    })

    const positions = await builder.execute()
    return {
      positionsJson: JSON.stringify(
        positions.map((position) => ({
          uri: position.uri,
          cid: position.cid,
          creator: position.creator,
          indexedAt: position.indexedAt,
          cabildeo: position.cabildeo,
          stance: position.stance,
          optionIndex:
            typeof position.optionIndex === 'number'
              ? position.optionIndex
              : undefined,
          text: position.text,
          compassQuadrant: position.compassQuadrant ?? '',
          createdAt: position.createdAt,
        })),
      ),
      cursor: keyset.packFromResult(positions),
    }
  },

  async getParaDelegationCandidates(req) {
    const cabildeo = await db.db
      .selectFrom('cabildeo_cabildeo')
      .where('uri', '=', req.cabildeoUri)
      .select(['uri', 'community', 'voteVisibility'])
      .executeTakeFirst()

    if (!cabildeo) {
      return { candidatesJson: '[]', cursor: '' }
    }

    const board = await selectCandidateCommunityBoard(
      db,
      req.communityId || cabildeo.community,
    )
    const rolesByDid = new Map<string, Set<string>>()

    if (board) {
      await assertActiveCommunityViewer(db, {
        communityUri: board.uri,
        viewerDid: req.viewerDid,
        viewerIsAdmin: req.viewerIsAdmin,
      })
      const [governance, members] = await Promise.all([
        getCandidateGovernanceRecord(db, board.name, board.slug),
        selectDelegateLikeMembers(db, board.uri),
      ])

      addGovernanceCandidates(rolesByDid, governance)
      for (const member of members) {
        const set = ensureRoleSet(rolesByDid, member.creator)
        for (const role of member.roles ?? []) {
          set.add(role)
        }
        if (set.size === 0) set.add('member')
      }
    }

    let dids = [...rolesByDid.keys()]
    if (dids.length === 0) {
      return { candidatesJson: '[]', cursor: '' }
    }

    // Hard cap to prevent unbounded memory usage during in-memory sort/hydration
    const MAX_DELEGATION_CANDIDATES = 1000
    if (dids.length > MAX_DELEGATION_CANDIDATES) {
      dids = dids.slice(0, MAX_DELEGATION_CANDIDATES)
    }

    const exposeCandidateVotes =
      normalizeVoteVisibility(cabildeo.voteVisibility) === 'public'

    const [profiles, delegationCounts, votes] = await Promise.all([
      hydrateCandidateProfiles(db, dids),
      getCandidateDelegationCounts(db, dids),
      exposeCandidateVotes
        ? getCandidateVotes(db, req.cabildeoUri, dids)
        : Promise.resolve(new Map()),
    ])

    const candidates = dids
      .map((did) => {
        const profile = profiles.get(did)
        const vote = votes.get(did)
        return {
          did,
          handle: profile?.handle ?? '',
          displayName: profile?.displayName ?? '',
          avatar: '',
          description: profile?.description ?? '',
          roles: [...(rolesByDid.get(did) ?? new Set<string>())],
          activeDelegationCount: delegationCounts.get(did) ?? 0,
          hasVoted: exposeCandidateVotes ? Boolean(vote) : false,
          votedAt: exposeCandidateVotes ? vote?.createdAt ?? '' : '',
          selectedOption:
            exposeCandidateVotes && typeof vote?.selectedOption === 'number'
              ? vote.selectedOption
              : undefined,
        }
      })
      .sort((a, b) => {
        const delegationDelta =
          b.activeDelegationCount - a.activeDelegationCount
        if (delegationDelta !== 0) return delegationDelta
        return (a.displayName || a.handle || a.did).localeCompare(
          b.displayName || b.handle || b.did,
        )
      })

    const rawOffset = decodeOffsetCursor(req.cursor)
    const limit = normalizeLimit(req.limit)
    const offset = Math.min(rawOffset, MAX_DELEGATION_CANDIDATES)
    const page = candidates.slice(offset, offset + limit)
    const nextOffset = offset + page.length

    return {
      candidatesJson: JSON.stringify(page),
      cursor:
        nextOffset < candidates.length && offset < MAX_DELEGATION_CANDIDATES
          ? encodeOffsetCursor(nextOffset)
          : '',
    }
  },

  async putParaCabildeoLivePresence(req) {
    const now = new Date()
    const nowIso = now.toISOString()
    const cabildeo = await db.db
      .selectFrom('cabildeo_cabildeo')
      .where('uri', '=', req.cabildeoUri)
      .select(['uri', 'phase'])
      .executeTakeFirst()

    if (!cabildeo || !isLiveCabildeoPhase(cabildeo.phase)) {
      return {
        cabildeoUri: req.cabildeoUri,
        present: false,
      }
    }

    if (!req.present) {
      await db.db
        .deleteFrom('cabildeo_live_presence')
        .where('cabildeo', '=', req.cabildeoUri)
        .where('actorDid', '=', req.actorDid)
        .where('sessionId', '=', req.sessionId)
        .execute()

      const session = await db.db
        .selectFrom('cabildeo_live_session')
        .where('cabildeo', '=', req.cabildeoUri)
        .select(['hostDid'])
        .executeTakeFirst()

      if (session?.hostDid === req.actorDid) {
        await db.db
          .updateTable('cabildeo_live_session')
          .set({
            endedAt: nowIso,
            updatedAt: nowIso,
          })
          .where('cabildeo', '=', req.cabildeoUri)
          .execute()
      }

      return {
        cabildeoUri: req.cabildeoUri,
        present: false,
      }
    }

    let session = await getActiveLiveSession(db, req.cabildeoUri, now)
    if (!session) {
      if (!req.hostLiveUri) {
        return {
          cabildeoUri: req.cabildeoUri,
          present: false,
        }
      }

      await db.db
        .insertInto('cabildeo_live_session')
        .values({
          cabildeo: req.cabildeoUri,
          hostDid: req.actorDid,
          liveUri: req.hostLiveUri,
          startedAt: nowIso,
          endedAt: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        })
        .onConflict((oc) =>
          oc.column('cabildeo').doUpdateSet({
            hostDid: req.actorDid,
            liveUri: req.hostLiveUri,
            startedAt: nowIso,
            endedAt: null,
            updatedAt: nowIso,
          }),
        )
        .execute()

      session = await getActiveLiveSession(db, req.cabildeoUri, now)
    } else if (
      session.hostDid === req.actorDid &&
      req.hostLiveUri &&
      req.hostLiveUri !== session.liveUri
    ) {
      await db.db
        .updateTable('cabildeo_live_session')
        .set({
          liveUri: req.hostLiveUri,
          updatedAt: nowIso,
        })
        .where('cabildeo', '=', req.cabildeoUri)
        .execute()
    }

    const expiresAt = presenceExpiry()
    const existing = await db.db
      .selectFrom('cabildeo_live_presence')
      .where('cabildeo', '=', req.cabildeoUri)
      .where('actorDid', '=', req.actorDid)
      .where('sessionId', '=', req.sessionId)
      .select(['joinedAt'])
      .executeTakeFirst()

    if (existing) {
      await db.db
        .updateTable('cabildeo_live_presence')
        .set({
          lastHeartbeatAt: nowIso,
          expiresAt,
        })
        .where('cabildeo', '=', req.cabildeoUri)
        .where('actorDid', '=', req.actorDid)
        .where('sessionId', '=', req.sessionId)
        .execute()
    } else {
      await db.db
        .insertInto('cabildeo_live_presence')
        .values({
          cabildeo: req.cabildeoUri,
          actorDid: req.actorDid,
          sessionId: req.sessionId,
          joinedAt: nowIso,
          lastHeartbeatAt: nowIso,
          expiresAt,
        })
        .execute()
    }

    return {
      cabildeoUri: req.cabildeoUri,
      present: true,
      expiresAt,
    }
  },
})

type CandidateGovernancePerson = {
  did?: string
  handle?: string
  displayName?: string
}

type CandidateGovernanceRecord = {
  moderators?: Array<CandidateGovernancePerson & { role?: string }>
  officials?: Array<CandidateGovernancePerson & { office?: string }>
  deputies?: Array<{
    role?: string
    activeHolder?: CandidateGovernancePerson
  }>
}

const selectCandidateCommunityBoard = async (
  db: Database,
  communityId: string,
) => {
  const normalizedSlug = normalizeCommunitySlug(communityId)

  if (communityId.startsWith('at://')) {
    const byUri = await db.db
      .selectFrom('para_community_board')
      .where('uri', '=', communityId)
      .select(['uri', 'name', 'slug'])
      .executeTakeFirst()
    if (byUri) return byUri
  }

  return db.db
    .selectFrom('para_community_board')
    .where(
      sql<boolean>`(
        "slug" = ${normalizedSlug}
        or regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]+', '-', 'g') = ${normalizedSlug}
      )`,
    )
    .select(['uri', 'name', 'slug'])
    .executeTakeFirst()
}

const selectDelegateLikeMembers = async (db: Database, communityUri: string) =>
  db.db
    .selectFrom('para_community_membership')
    .where('communityUri', '=', communityUri)
    .where('membershipState', '=', 'active')
    .where(
      sql<boolean>`coalesce("roles", array[]::text[]) && array[
        'delegate',
        'delegado',
        'representative',
        'representante',
        'moderator',
        'official',
        'deputy',
        'subdelegate',
        'agent'
      ]::text[]`,
    )
    .select(['creator', 'roles'])
    .execute()

const assertActiveCommunityViewer = async (
  db: Database,
  opts: {
    communityUri: string
    viewerDid: string
    viewerIsAdmin: boolean
  },
) => {
  if (opts.viewerIsAdmin) return
  if (!opts.viewerDid) {
    throw new ConnectError(
      'Active community membership is required',
      Code.PermissionDenied,
    )
  }
  const membership = await db.db
    .selectFrom('para_community_membership')
    .where('creator', '=', opts.viewerDid)
    .where('communityUri', '=', opts.communityUri)
    .where('membershipState', '=', 'active')
    .select(['uri'])
    .executeTakeFirst()

  if (!membership) {
    throw new ConnectError(
      'Active community membership is required',
      Code.PermissionDenied,
    )
  }
}

const getCandidateGovernanceRecord = async (
  db: Database,
  community: string,
  slug: string,
): Promise<CandidateGovernanceRecord | null> => {
  const suffix = `/com.para.community.governance/${slug || 'community'}`
  const slugMatch = await db.db
    .selectFrom('record')
    .select(['json'])
    .where('uri', 'like', `%${suffix}`)
    .orderBy('indexedAt', 'desc')
    .executeTakeFirst()

  if (slugMatch) return parseCandidateGovernance(slugMatch.json)

  const normalizedCommunity = normalizeCommunityKey(community)
  const recordMatch = await db.db
    .selectFrom('record')
    .select(['json'])
    .where('uri', 'like', '%/com.para.community.governance/%')
    .where(
      sql`regexp_replace(lower(translate(regexp_replace(coalesce(("record"."json"::jsonb ->> 'community'), ''), '^p/', '', 'i'), ${COMMUNITY_TRANSLATION_SOURCE}, ${COMMUNITY_TRANSLATION_TARGET})), '[^a-z0-9]+', '', 'g')`,
      '=',
      normalizedCommunity,
    )
    .orderBy('indexedAt', 'desc')
    .executeTakeFirst()

  return recordMatch ? parseCandidateGovernance(recordMatch.json) : null
}

const parseCandidateGovernance = (
  json: string,
): CandidateGovernanceRecord | null => {
  try {
    const parsed = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as CandidateGovernanceRecord
  } catch {
    return null
  }
}

const addGovernanceCandidates = (
  rolesByDid: Map<string, Set<string>>,
  governance: CandidateGovernanceRecord | null,
) => {
  for (const moderator of governance?.moderators ?? []) {
    if (!moderator.did) continue
    const roles = ensureRoleSet(rolesByDid, moderator.did)
    roles.add(moderator.role || 'moderator')
  }

  for (const official of governance?.officials ?? []) {
    if (!official.did) continue
    const roles = ensureRoleSet(rolesByDid, official.did)
    roles.add(official.office || 'official')
  }

  for (const deputy of governance?.deputies ?? []) {
    const holder = deputy.activeHolder
    if (!holder?.did) continue
    const roles = ensureRoleSet(rolesByDid, holder.did)
    roles.add(deputy.role || 'deputy')
  }
}

const ensureRoleSet = (map: Map<string, Set<string>>, did: string) => {
  let set = map.get(did)
  if (!set) {
    set = new Set<string>()
    map.set(did, set)
  }
  return set
}

const hydrateCandidateProfiles = async (db: Database, dids: string[]) => {
  const rows = await db.db
    .selectFrom('actor')
    .leftJoin('profile', 'profile.creator', 'actor.did')
    .where('actor.did', 'in', dids)
    .select([
      'actor.did',
      'actor.handle',
      'profile.displayName',
      'profile.description',
    ])
    .execute()

  return new Map(rows.map((row) => [row.did, row]))
}

const getCandidateDelegationCounts = async (db: Database, dids: string[]) => {
  const rows = await db.db
    .selectFrom('cabildeo_delegation')
    .where('delegateTo', 'in', dids)
    .select(['delegateTo', sql<number>`count(distinct "creator")`.as('count')])
    .groupBy('delegateTo')
    .execute()

  return new Map(rows.map((row) => [row.delegateTo, Number(row.count) || 0]))
}

const getCandidateVotes = async (
  db: Database,
  cabildeoUri: string,
  dids: string[],
) => {
  const rows = await db.db
    .selectFrom('cabildeo_vote')
    .where('cabildeo', '=', cabildeoUri)
    .where('creator', 'in', dids)
    .select(['creator', 'selectedOption', 'createdAt'])
    .orderBy('sortAt', 'desc')
    .execute()
  const votes = new Map<
    string,
    { selectedOption: number | null; createdAt: string }
  >()

  for (const row of rows) {
    if (!votes.has(row.creator)) {
      votes.set(row.creator, {
        selectedOption: row.selectedOption,
        createdAt: row.createdAt,
      })
    }
  }

  return votes
}

class RankedTimeCidKeyset extends TimeCidKeyset<{
  sortRank: string
  cid: string
}> {
  labelResult(result: { sortRank: string; cid: string }) {
    return { primary: result.sortRank, secondary: result.cid }
  }
}

const mapCabildeoRow = async (
  db: Database,
  row: {
    uri: string
    cid: string
    creator: string
    title: string
    description: string
    community: string
    communities: unknown
    flairs: unknown
    region: string | null
    geoRestricted: 0 | 1 | null
    options: unknown
    minQuorum: number | null
    voteVisibility?: string | null
    phase: string
    phaseDeadline: string | null
    createdAt: string
    indexedAt: string
    positionCount: number
    positionForCount: number
    positionAgainstCount: number
    positionAmendmentCount: number
    voteCount: number
    directVoteCount: number
    delegatedVoteCount: number
    optionVoteCounts: unknown
    optionPositionCounts: unknown
    winningOption: number | null
    isTie: 0 | 1
    sortRank?: string
  },
  viewerDid?: string,
  now?: Date,
) => {
  const options = asOptions(row.options)
  const voteCounts = asNumberArray(row.optionVoteCounts, options.length)
  const positionCounts = asNumberArray(row.optionPositionCounts, options.length)
  const voteVisibility = normalizeVoteVisibility(row.voteVisibility)

  const optionSummary = options.map((option, optionIndex) => ({
    optionIndex,
    label: option.label,
    votes: voteCounts[optionIndex] || 0,
    positions: positionCounts[optionIndex] || 0,
  }))

  const positionSummary = {
    total: row.positionCount,
    forCount: row.positionForCount,
    againstCount: row.positionAgainstCount,
    amendmentCount: row.positionAmendmentCount,
    byOption: optionSummary,
  }

  const voteTotals = {
    total: row.voteCount,
    direct: row.directVoteCount,
    delegated: row.delegatedVoteCount,
  }

  const outcomeSummary =
    row.phase === 'resolved'
      ? {
          winningOption:
            typeof row.winningOption === 'number'
              ? row.winningOption
              : undefined,
          totalParticipants: row.voteCount,
          effectiveTotalPower: row.voteCount,
          tie: row.isTie === 1,
          breakdown: optionSummary,
        }
      : undefined

  const viewerContext = viewerDid
    ? await getViewerContext(db, row.uri, viewerDid)
    : undefined
  const liveSession = isLiveCabildeoPhase(row.phase)
    ? await getLiveSessionSummary(db, row.uri, now ?? new Date())
    : undefined
  const partyVoteSummary =
    voteVisibility === 'party_only'
      ? await getPartyVoteSummary(db, row.uri, options.length)
      : undefined

  return {
    uri: row.uri,
    cid: row.cid,
    creator: row.creator,
    indexedAt: row.indexedAt,
    title: row.title,
    description: row.description,
    community: row.community,
    communities: asStringArray(row.communities),
    flairs: asStringArray(row.flairs),
    region: row.region ?? '',
    geoRestricted: row.geoRestricted === 1,
    options,
    minQuorum:
      typeof row.minQuorum === 'number' && row.minQuorum > 0
        ? row.minQuorum
        : undefined,
    voteVisibility,
    phase: row.phase,
    phaseDeadline: row.phaseDeadline ?? '',
    createdAt: row.createdAt,
    optionSummary,
    positionCounts: positionSummary,
    voteTotals,
    partyVoteSummary,
    outcomeSummary,
    viewerContext,
    liveSession,
  }
}

const getViewerContext = async (
  db: Database,
  cabildeoUri: string,
  viewerDid: string,
) => {
  const [currentVote, delegation] = await Promise.all([
    db.db
      .selectFrom('cabildeo_vote')
      .where('creator', '=', viewerDid)
      .where('cabildeo', '=', cabildeoUri)
      .orderBy('sortAt', 'desc')
      .orderBy('cid', 'desc')
      .select(['selectedOption', 'isDirect', 'createdAt'])
      .executeTakeFirst(),
    db.db
      .selectFrom('cabildeo_delegation')
      .where('creator', '=', viewerDid)
      .where((qb) =>
        qb.where('cabildeo', '=', cabildeoUri).orWhere('cabildeo', 'is', null),
      )
      .orderBy(sql`case when "cabildeo" = ${cabildeoUri} then 0 else 1 end`)
      .orderBy('createdAt', 'desc')
      .orderBy('indexedAt', 'desc')
      .select(['delegateTo'])
      .executeTakeFirst(),
  ])

  const delegateVote =
    delegation?.delegateTo && delegation.delegateTo.length
      ? await db.db
          .selectFrom('cabildeo_vote')
          .where('creator', '=', delegation.delegateTo)
          .where('cabildeo', '=', cabildeoUri)
          .orderBy('sortAt', 'desc')
          .orderBy('cid', 'desc')
          .select(['selectedOption', 'createdAt'])
          .executeTakeFirst()
      : null

  const delegatedVotedAt = delegateVote?.createdAt ?? ''
  const gracePeriodEndsAt = delegatedVotedAt
    ? new Date(
        new Date(delegatedVotedAt).getTime() + 24 * 60 * 60 * 1000,
      ).toISOString()
    : ''

  return {
    currentVoteOption:
      typeof currentVote?.selectedOption === 'number'
        ? currentVote.selectedOption
        : undefined,
    currentVoteIsDirect: currentVote?.isDirect === 1,
    currentVoteCreatedAt: currentVote?.createdAt ?? '',
    activeDelegation: delegation?.delegateTo ?? '',
    delegateHasVoted: !!delegateVote,
    delegatedVoteOption:
      typeof delegateVote?.selectedOption === 'number'
        ? delegateVote.selectedOption
        : undefined,
    delegatedVotedAt,
    gracePeriodEndsAt,
    delegateVoteDismissed: false,
  }
}

const getPartyVoteSummary = async (
  db: Database,
  cabildeoUri: string,
  optionCount: number,
) => {
  const rows = await db.db
    .selectFrom('cabildeo_vote')
    .leftJoin('para_status', 'para_status.did', 'cabildeo_vote.creator')
    .where('cabildeo_vote.cabildeo', '=', cabildeoUri)
    .select([
      sql<string>`coalesce(nullif("para_status"."party", ''), 'unaffiliated')`.as(
        'party',
      ),
      'cabildeo_vote.selectedOption as selectedOption',
      sql<number>`count(*)`.as('count'),
    ])
    .groupBy(['para_status.party', 'cabildeo_vote.selectedOption'])
    .execute()

  const summary = new Map<
    string,
    { party: string; total: number; byOption: number[] }
  >()
  for (const row of rows) {
    const party = normalizePartyLabel(row.party)
    const item =
      summary.get(party) ??
      {
        party,
        total: 0,
        byOption: Array.from({ length: optionCount }, () => 0),
      }
    const count = Number(row.count) || 0
    item.total += count
    if (
      typeof row.selectedOption === 'number' &&
      row.selectedOption >= 0 &&
      row.selectedOption < item.byOption.length
    ) {
      item.byOption[row.selectedOption] += count
    }
    summary.set(party, item)
  }

  return [...summary.values()].sort((a, b) => {
    const totalDelta = b.total - a.total
    if (totalDelta !== 0) return totalDelta
    return a.party.localeCompare(b.party)
  })
}

const normalizePartyLabel = (value: unknown) => {
  const party = typeof value === 'string' ? value.trim() : ''
  return party || 'unaffiliated'
}

const normalizeVoteVisibility = (value: unknown) =>
  value === 'party_only' || value === 'anonymous' ? value : 'public'

type CivicOption = {
  label: string
  description?: string
  isConsensus?: boolean
}

const asOptions = (value: unknown): CivicOption[] => {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (
        item,
      ): item is {
        label?: unknown
        description?: unknown
        isConsensus?: unknown
      } => typeof item === 'object' && item !== null,
    )
    .map((item) => ({
      label: typeof item.label === 'string' ? item.label : '',
      description: typeof item.description === 'string' ? item.description : '',
      isConsensus: item.isConsensus === true,
    }))
}

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

const asNumberArray = (value: unknown, length: number): number[] => {
  const base = Array.from({ length }, () => 0)
  if (!Array.isArray(value)) return base
  for (let i = 0; i < Math.min(value.length, length); i++) {
    const current = value[i]
    if (typeof current === 'number' && Number.isFinite(current)) {
      base[i] = Math.max(0, Math.floor(current))
    }
  }
  return base
}

const normalizeCommunity = (value: string | undefined) => {
  return value?.trim().toLowerCase().replace(/^p\//, '') || ''
}

const COMMUNITY_TRANSLATION_SOURCE =
  'ÁÀÄÂÃáàäâãÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç'
const COMMUNITY_TRANSLATION_TARGET =
  'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'

const normalizeCommunityKey = (value: string) =>
  value
    .trim()
    .replace(/^p\//i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const normalizeCommunitySlug = (value: string) =>
  value
    .trim()
    .replace(/^p\//i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const normalizeLimit = (limit: number) => {
  if (!limit || Number.isNaN(limit)) return 50
  return Math.max(1, Math.min(limit, 100))
}

const decodeOffsetCursor = (cursor?: string) => {
  if (!cursor) return 0
  const parsed = Number.parseInt(cursor, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

const encodeOffsetCursor = (offset: number) => String(Math.max(0, offset))
