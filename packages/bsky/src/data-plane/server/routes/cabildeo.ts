import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import type { Service } from '../../../proto/bsky_connect.js'
import { getAuthoritySnapshot } from '../community-authority.js'
import {
  accountOfficeHolders,
  communityAccountDid,
  resolveCommunityAccountUris,
} from '../community-membership.js'
import type { Database } from '../db/index.js'
import { TimeCidKeyset, paginate } from '../db/pagination.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaCabildeos(req) {
    const { ref } = db.db.dynamic
    const normalizedCommunity = normalizeCommunity(req.community)
    const phase = req.phase?.trim()
    let builder = db.db.selectFrom('cabildeo_cabildeo').selectAll()

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
    if (req.query) {
      builder = builder.where((eb) =>
        eb.or([
          eb('title', 'ilike', `%${req.query}%`),
          eb('description', 'ilike', `%${req.query}%`),
        ]),
      )
    }

    const keyset = new TimeCidKeyset(
      ref('cabildeo_cabildeo.sortAt'),
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
      rows.map((row) => mapCabildeoRow(db, row, req.viewerDid || undefined)),
    )

    return {
      itemsJson: JSON.stringify(views),
      cursor: keyset.packFromResult(rows),
    }
  },

  async getParaCabildeo(req) {
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
        await mapCabildeoRow(db, row, req.viewerDid || undefined),
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
      for (const did of await accountOfficeHolders(
        db,
        communityAccountDid(board.uri) ?? '',
        'moderator',
      )) {
        ensureRoleSet(rolesByDid, did).add('moderator')
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
          votedAt: exposeCandidateVotes ? (vote?.createdAt ?? '') : '',
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
})

/** The community account a request names, by URI, DID, handle or slug. */
export const selectCandidateCommunityBoard = async (
  db: Database,
  communityId: string,
) => {
  const [uri] = await resolveCommunityAccountUris(db, communityId)
  const did = uri ? communityAccountDid(uri) : null
  if (!uri || !did) return undefined
  const account = await db.db
    .selectFrom('para_community_account')
    .where('did', '=', did)
    .select(['name'])
    .executeTakeFirst()
  return { uri, creator: did, name: account?.name ?? null, slug: null }
}

/*
 * Delegation candidates and the roles reported for them: the community's
 * moderators, by its chain. Offices are never self-declared. Being listed is
 * not proof of electoral weight. Self-nomination as a delegate has no chain
 * action yet.
 */

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
  const authority = await getAuthoritySnapshot(
    db,
    opts.communityUri,
    opts.viewerDid,
  )
  if (authority.membershipState !== 'active') {
    throw new ConnectError(
      'Active community membership is required',
      Code.PermissionDenied,
    )
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
    latE7: number | null
    lngE7: number | null
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
    optionEffectivePowerMicros: unknown
    effectiveTotalPowerMicros: string
    optionPositionCounts: unknown
    winningOption: number | null
    isTie: 0 | 1
  },
  viewerDid?: string,
) => {
  const options = asOptions(row.options)
  const voteCounts = asNumberArray(row.optionVoteCounts, options.length)
  const effectivePowerMicros = asNumberArray(
    row.optionEffectivePowerMicros,
    options.length,
  )
  const positionCounts = asNumberArray(row.optionPositionCounts, options.length)
  const voteVisibility = normalizeVoteVisibility(row.voteVisibility)

  const optionSummary = options.map((option, optionIndex) => ({
    optionIndex,
    label: option.label,
    votes: voteCounts[optionIndex] || 0,
    effectivePowerMicros: effectivePowerMicros[optionIndex] || 0,
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
          effectiveTotalPower:
            (Number(row.effectiveTotalPowerMicros) || 0) / 1_000_000,
          effectiveTotalPowerMicros: Number(row.effectiveTotalPowerMicros) || 0,
          tie: row.isTie === 1,
          breakdown: optionSummary,
        }
      : undefined

  const viewerContext = viewerDid
    ? await getViewerContext(db, row.uri, viewerDid)
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
    geo:
      typeof row.latE7 === 'number' && typeof row.lngE7 === 'number'
        ? { latE7: row.latE7, lngE7: row.lngE7 }
        : undefined,
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
  }
}

const getViewerContext = async (
  db: Database,
  cabildeoUri: string,
  viewerDid: string,
) => {
  const [currentVote, grants, subject] = await Promise.all([
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
      .where((eb) =>
        eb.or([eb('cabildeo', '=', cabildeoUri), eb('cabildeo', 'is', null)]),
      )
      .where('eligibilityProofRef', 'is not', null)
      .select([
        'uri',
        'mode',
        'cabildeo',
        'delegateTo',
        'party',
        'community',
        'scopeFlairs',
        'indexedAt',
      ])
      .execute(),
    db.db
      .selectFrom('cabildeo_cabildeo')
      .where('uri', '=', cabildeoUri)
      .select(['community', 'flairs'])
      .executeTakeFirst(),
  ])

  const standing = grants.filter(
    (grant) =>
      grant.mode === 'passive' &&
      grant.delegateTo &&
      grant.cabildeo === null &&
      grant.community?.trim().toLowerCase() ===
        subject?.community.trim().toLowerCase() &&
      grant.scopeFlairs?.some((flair) => subject?.flairs?.includes(flair)),
  )
  const parties = standing.length
    ? await db.db
        .selectFrom('para_status')
        .where(
          'did',
          'in',
          standing.map((grant) => grant.delegateTo!),
        )
        .select(['did', 'party'])
        .execute()
    : []
  const partyByDid = new Map(
    parties.map((row) => [row.did, row.party?.trim().toLowerCase()]),
  )
  const delegation = grants
    .filter(
      (grant) =>
        grant.delegateTo &&
        ((grant.mode === 'active' && grant.cabildeo === cabildeoUri) ||
          (grant.mode === 'passive' &&
            standing.includes(grant) &&
            partyByDid.get(grant.delegateTo) ===
              grant.party?.trim().toLowerCase())),
    )
    .sort((a, b) => {
      if (a.mode !== b.mode) return a.mode === 'active' ? -1 : 1
      return (
        b.indexedAt.localeCompare(a.indexedAt) || b.uri.localeCompare(a.uri)
      )
    })[0]

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
    gracePeriodEndsAt: '',
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
    const item = summary.get(party) ?? {
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
