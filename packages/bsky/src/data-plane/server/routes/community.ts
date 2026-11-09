import { Code, ConnectError, ServiceImpl } from '@connectrpc/connect'
import { type Selectable, sql } from 'kysely'
import {
  AUTHORITY_EVENT_VERSION,
  type CommunityMember,
  type CommunityOffice,
  effectiveCommunityMember,
  getRoleDefinitions,
  resolveAvailableAction,
} from '@atproto/common'
import { com } from '../../../lexicons/index.js'
import { Service } from '../../../proto/bsky_connect.js'
import {
  GetParaCommunityBoardResponse,
  GetParaCommunityBoardsResponse,
  GetParaCommunityAuthorizationResponse,
  GetParaCommunityGovernanceResponse,
  GetParaCommunityMembersResponse,
  GetParaCommunityPostsResponse,
  GetParaPolicyCommunityVotesResponse,
  GetParaCommunityRelationsResponse,
  GetParaCommunitySharedContentResponse,
  ParaAuthorFeedItem,
  ParaAvailableAction,
  ParaCommunityBoardView,
  ParaCommunityDeputyRole,
  ParaCommunityGovernanceHistoryEntry,
  ParaCommunityGovernanceMetadata,
  ParaCommunityGovernanceSummary,
  ParaCommunityMember,
  ParaCommunityMemberView,
  ParaCommunityModerator,
  ParaCommunityOfficial,
  ParaCommunityRelationView,
  ParaCommunitySharedContentView,
  ParaCommunitySummary,
  ParaPolicyCommunityVote,
  ParaPolicySignalBucket,
  ParaRoleDefinition,
  ParaRoleHolder,
  ParaSharedContentActionView,
  ParaStrongRef,
} from '../../../proto/bsky_pb.js'
import {
  accountOfficeHolders,
  activeMemberDids,
  communityAccountDid,
  countActiveMembers,
  effectivelyActiveSql,
  resolveCommunityAccountUris,
} from '../community-membership.js'
import {
  type AuthoritySnapshot,
  filterByOfficeWhenIndexed,
  getAuthoritySnapshot,
  getAuthoritySnapshots,
} from '../community-authority.js'
import {
  type GovernanceBoard,
  getTrustedGovernanceRecordJson,
  governanceSlugMatchSql,
  isTrustedBoardGovernanceSql,
} from '../community-governance.js'
import type { DatabaseSchemaType } from '../db/database-schema.js'
import { Database } from '../db/index.js'
import {
  CreatedAtCidKeyset,
  IndexedAtCidKeyset,
  JoinedAtCidKeyset,
  TimeCidKeyset,
  paginate,
} from '../db/pagination.js'
import { countAll } from '../db/util.js'

type BoardRow = {
  uri: string
  cid: string
  creator: string
  slug: string
  name: string
  description: string | null
  quadrant: string
  region: string | null
  delegatesChatId: string
  subdelegatesChatId: string
  createdAt: string
  indexedAt: string
  creatorHandle: string | null
  creatorDisplayName: string | null
  state: string | null
  matterFlairIds: string[] | null
  policyFlairIds: string[] | null
  moderatorCount: number | null
  officialCount: number | null
  deputyRoleCount: number | null
  lastPublishedAt: string | null
  governanceMode: string | null
  admissionMode: string
}

type MembershipRow = {
  communityUri: string
  creator?: string
  membershipState: string
  roles: string[] | null
  roleAssignments: Record<string, unknown>[] | null
  joinedAt?: string
}

type GovernanceRecord = com.para.community.governance.Main

const AUTHORIZATION_ACTIONS = [
  'content.create',
  'content.share',
  'proposal.create',
  'content.moderate',
  'member.suspendTemporary',
  'member.remove',
  'member.block',
  'moderator.elect',
  'moderator.recall',
  'governance.amend',
  'budget.approve',
]

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaCommunityAuthorization(req) {
    const board = await selectBoard(db, undefined, req.community)
    if (!board || !req.viewerDid) {
      return new GetParaCommunityAuthorizationResponse({
        authorization: new ParaAvailableAction({
          action: req.action,
          status: 'denied',
          policy: 'authentication_required',
          reason: 'Authentication is required for this action.',
        }),
      })
    }
    const snapshot = await getAuthoritySnapshot(db, board.uri, req.viewerDid)
    const authorization = resolveAvailableAction(
      req.action,
      snapshot.roles,
      (board.governanceMode || 'hierarchical') as 'hierarchical' | 'horizontal',
    )
    return new GetParaCommunityAuthorizationResponse({
      roles: snapshot.roles,
      capabilities: snapshot.capabilities,
      authorization: new ParaAvailableAction(authorization),
    })
  },

  async getParaCommunityBoard(req) {
    try {
      const board = await selectBoard(db, req.communityId, req.uri)
      if (!board) {
        return new GetParaCommunityBoardResponse()
      }
      const [
        viewerMembership,
        memberCount,
        governanceSummary,
        childCounts,
        sharedCounts,
        parentUris,
      ] = await Promise.all([
        req.viewerDid
          ? getViewerMemberships(db, req.viewerDid, [board.uri]).then(
              (memberships) => memberships.get(board.uri),
            )
          : Promise.resolve(undefined),
        getMemberCounts(db, [board.uri]).then(
          (counts) => counts.get(board.uri) ?? 0,
        ),
        getGovernanceSummary(db, board).catch(() => null),
        getChildCommunityCounts(db, [board.uri]),
        getSharedContentCounts(db, [board.uri]),
        getParentCommunityUris(db, [board.uri]),
      ])
      const snapshot = req.viewerDid
        ? await getAuthoritySnapshot(db, board.uri, req.viewerDid)
        : undefined
      const standard = (board.governanceMode || 'hierarchical') as
        'hierarchical' | 'horizontal'

      return new GetParaCommunityBoardResponse({
        board: toBoardView(board, memberCount, viewerMembership, {
          childCommunityCount: childCounts.get(board.uri) ?? 0,
          sharedContentCount: sharedCounts.get(board.uri) ?? 0,
          parentCommunityUris: parentUris.get(board.uri) ?? [],
        }),
        governanceSummary: governanceSummary ?? undefined,
        viewerCapabilities: snapshot?.capabilities ?? [],
        availableActions: snapshot
          ? AUTHORIZATION_ACTIONS.map(
              (action) =>
                new ParaAvailableAction(
                  resolveAvailableAction(action, snapshot.roles, standard),
                ),
            )
          : [],
      })
    } catch (err) {
      throw err
    }
  },

  async getParaCommunityBoards(req) {
    const result = await selectBoards(db, {
      limit: normalizeLimit(req.limit),
      cursor: req.cursor,
      query: req.query,
      state: req.state,
      participationKind: req.participationKind,
      flairId: req.flairId,
      sort: req.sort,
      quadrant: req.quadrant,
      region: req.region,
    })
    if (result.boards.length === 0) {
      return new GetParaCommunityBoardsResponse({ boards: [] })
    }

    const uris = result.boards.map((board) => board.uri)
    const [
      memberCounts,
      viewerMemberships,
      childCounts,
      sharedCounts,
      parentUris,
    ] = await Promise.all([
      getMemberCounts(db, uris),
      req.viewerDid
        ? getViewerMemberships(db, req.viewerDid, uris)
        : Promise.resolve(new Map<string, MembershipRow>()),
      getChildCommunityCounts(db, uris),
      getSharedContentCounts(db, uris),
      getParentCommunityUris(db, uris),
    ])

    return new GetParaCommunityBoardsResponse({
      boards: result.boards.map((board) =>
        toBoardView(
          board,
          memberCounts.get(board.uri) ?? 0,
          viewerMemberships.get(board.uri),
          {
            childCommunityCount: childCounts.get(board.uri) ?? 0,
            sharedContentCount: sharedCounts.get(board.uri) ?? 0,
            parentCommunityUris: parentUris.get(board.uri) ?? [],
          },
        ),
      ),
      cursor: result.cursor,
    })
  },

  async getParaCommunityMembers(req) {
    const board = await selectBoard(db, req.communityId, undefined)
    if (!board) {
      return new GetParaCommunityMembersResponse({ members: [] })
    }
    await assertActiveCommunityViewer(db, {
      communityUri: board.uri,
      viewerDid: req.viewerDid,
      viewerIsAdmin: req.viewerIsAdmin,
    })

    const result = await selectMembers(db, board.uri, {
      membershipState: req.membershipState,
      role: req.role,
      sort: req.sort,
      limit: normalizeLimit(req.limit),
      cursor: req.cursor,
    })

    return new GetParaCommunityMembersResponse({
      members: result.members.map(
        (member) => new ParaCommunityMemberView(member),
      ),
      cursor: result.cursor,
    })
  },

  async getParaPolicyCommunityVotes(req) {
    const board = await selectBoard(db, req.communityId, undefined)
    if (!board) {
      return new GetParaPolicyCommunityVotesResponse({})
    }
    // Who voted is public (the ballots live in public repos), but "my
    // community" is a view for its own members.
    await assertActiveCommunityViewer(db, {
      communityUri: board.uri,
      viewerDid: req.viewerDid,
      viewerIsAdmin: req.viewerIsAdmin,
    })

    const members = db.db.selectFrom(
      activeMemberDids(db, board.uri).as('membership'),
    )
    const voters = members
      .innerJoin('para_policy_vote as vote', 'vote.creator', 'membership.did')
      .where('vote.subject', '=', req.postUri)
      .where('vote.subjectType', '=', 'policy')

    const [memberCount, breakdown, rows] = await Promise.all([
      members.select(sql<number>`count(*)`.as('count')).executeTakeFirst(),
      voters
        .select(['vote.signal as signal', sql<number>`count(*)`.as('count')])
        .groupBy('vote.signal')
        .orderBy('vote.signal', 'asc')
        .execute(),
      voters
        .leftJoin('actor as actor', 'actor.did', 'vote.creator')
        .leftJoin('profile as profile', 'profile.creator', 'vote.creator')
        .select([
          'vote.creator as did',
          'vote.signal as signal',
          'vote.createdAt as createdAt',
          'actor.handle as handle',
          'profile.displayName as displayName',
        ])
        .orderBy('vote.createdAt', 'desc')
        .orderBy('vote.creator', 'asc')
        .limit(normalizeLimit(req.limit))
        .execute(),
    ])

    const voterCount = breakdown.reduce(
      (sum, row) => sum + Number(row.count),
      0,
    )
    const signalSum = breakdown.reduce(
      (sum, row) => sum + Number(row.signal) * Number(row.count),
      0,
    )

    return new GetParaPolicyCommunityVotesResponse({
      communityUri: board.uri,
      communityName: board.name ?? '',
      memberCount: Number(memberCount?.count) || 0,
      voterCount,
      signalAverage: voterCount > 0 ? signalSum / voterCount : 0,
      breakdown: breakdown.map(
        (row) =>
          new ParaPolicySignalBucket({
            signal: Number(row.signal),
            count: Number(row.count),
          }),
      ),
      votes: rows.map(
        (row) =>
          new ParaPolicyCommunityVote({
            did: row.did,
            handle: row.handle ?? '',
            displayName: row.displayName ?? '',
            avatar: '',
            signal: Number(row.signal),
            createdAt: row.createdAt,
          }),
      ),
    })
  },

  async getParaCommunityGovernance(req) {
    const community = normalizeCommunitySlug(req.community)
    const board = await selectBoard(db, req.community, undefined)
    const accountDid = board ? communityAccountDid(board.uri) : null
    const [record, counters] = await Promise.all([
      board ? getPublishedGovernanceRecord(db, board) : null,
      getCommunityCounters(db, community),
    ])

    const computedAt = new Date().toISOString()
    const now = Date.now()

    const isValidGovernanceEntry = (entry: {
      validFrom?: string
      validUntil?: string
    }) => {
      const validFrom = entry.validFrom ? Date.parse(entry.validFrom) : 0
      const validUntil = entry.validUntil
        ? Date.parse(entry.validUntil)
        : Infinity
      if (validFrom > now) return false
      if (validUntil <= now) return false
      return true
    }

    const standard = (board?.governanceMode || 'hierarchical') as
      'hierarchical' | 'horizontal'
    const admissionMode = (board?.admissionMode || 'open') as
      'open' | 'assembly_approval'
    const authoritySubjects =
      board && !accountDid
        ? await db.db
            .selectFrom('para_community_authority_event')
            .where('communityUri', '=', board.uri)
            .select('subject')
            .distinct()
            .execute()
        : []
    const authorities =
      board && !accountDid
        ? await getAuthoritySnapshots(
            db,
            board.uri,
            authoritySubjects.map((row) => row.subject),
          )
        : new Map<string, AuthoritySnapshot>()
    const roleHolders: ParaRoleHolder[] = []
    if (accountDid)
      roleHolders.push(...(await accountRoleHolders(db, accountDid)))
    for (const [did, authority] of authorities) {
      for (const role of authority.roles) {
        const evidence = authority.evidence[role]
        if (!evidence) continue
        roleHolders.push(
          new ParaRoleHolder({
            did,
            role,
            effectiveAt: evidence.effectiveAt,
            expiresAt: evidence.expiresAt ?? '',
            evidence: evidence.evidence || evidence.uri,
          }),
        )
      }
    }

    return new GetParaCommunityGovernanceResponse({
      community,
      summary: new ParaCommunitySummary(
        accountDid
          ? {
              ...counters,
              members:
                (await countActiveMembers(db, [board!.uri])).get(board!.uri) ??
                0,
            }
          : counters,
      ),
      moderators: accountDid
        ? await accountModerators(db, accountDid)
        : (record?.moderators.filter(isValidGovernanceEntry).map(
            (moderator) =>
              new ParaCommunityModerator({
                member: toGovernanceMember(moderator),
                role: moderator.role,
                badge: moderator.badge,
              }),
          ) ?? []),
      officials:
        record?.officials.filter(isValidGovernanceEntry).map(
          (official) =>
            new ParaCommunityOfficial({
              member: toGovernanceMember(official),
              office: official.office,
              mandate: official.mandate,
            }),
        ) ?? [],
      deputies:
        record?.deputies.filter(isValidGovernanceEntry).map(
          (deputy) =>
            new ParaCommunityDeputyRole({
              tier: Number(deputy.tier) || 0,
              role: deputy.role,
              activeHolder: deputy.activeHolder
                ? toGovernanceMember(deputy.activeHolder)
                : undefined,
              votesBackingRole: deputy.votes,
              applicants: deputy.applicants.map(
                (applicant) =>
                  applicant.displayName ||
                  applicant.handle ||
                  applicant.did ||
                  '',
              ),
            }),
        ) ?? [],
      computedAt: record?.updatedAt || record?.createdAt || computedAt,
      metadata: record?.metadata
        ? new ParaCommunityGovernanceMetadata({
            termLengthDays: record.metadata.termLengthDays ?? 0,
            reviewCadence: record.metadata.reviewCadence ?? '',
            escalationPath: record.metadata.escalationPath ?? '',
            publicContact: record.metadata.publicContact ?? '',
            lastPublishedAt:
              record.metadata.lastPublishedAt ||
              record.updatedAt ||
              record.createdAt,
            state: record.metadata.state ?? '',
            matterFlairIds: record.metadata.matterFlairIds ?? [],
            policyFlairIds: record.metadata.policyFlairIds ?? [],
          })
        : undefined,
      editHistory:
        record?.editHistory?.map(
          (entry) =>
            new ParaCommunityGovernanceHistoryEntry({
              id: entry.id,
              action: entry.action,
              actorDid: entry.actorDid ?? '',
              actorHandle: entry.actorHandle ?? '',
              createdAt: entry.createdAt,
              summary: entry.summary,
            }),
        ) ?? [],
      organizationStandard: standard,
      admissionMode,
      authorityEventVersion: AUTHORITY_EVENT_VERSION,
      roleDefinitions: getRoleDefinitions(standard, admissionMode).map(
        (definition) => new ParaRoleDefinition(definition),
      ),
      roleHolders,
    })
  },

  async getParaCommunityPosts(req) {
    const { ref } = db.db.dynamic
    const board = await selectBoardPostIdentity(db, req.community)

    let builder = db.db
      .selectFrom('para_post')
      .selectAll('para_post')
      .where(paraCommunityMetaMatches(req.community, board))

    if (req.postType) {
      builder = builder.where(
        sql<boolean>`(
          "para_post"."postType" = ${req.postType}
          or exists (
            select 1
            from "para_post_meta"
            where "para_post_meta"."postUri" = "para_post"."uri"
              and "para_post_meta"."postType" = ${req.postType}
          )
        )`,
      )
    }

    const keyset = new TimeCidKeyset(
      ref('para_post.sortAt'),
      ref('para_post.cid'),
    )

    builder = paginate(builder, {
      limit: req.limit,
      cursor: req.cursor,
      keyset,
      tryIndex: true,
    })

    const posts = await builder.execute()
    console.log('[getParaCommunityPosts] Results count:', posts.length)

    return new GetParaCommunityPostsResponse({
      items: posts.map(
        (row) =>
          new ParaAuthorFeedItem({
            uri: row.uri,
            cid: row.cid,
            author: row.creator,
            text: row.text,
            createdAt: row.createdAt,
            replyRoot: row.replyRoot ?? undefined,
            replyParent: row.replyParent ?? undefined,
            langs: row.langs ?? [],
            tags: row.tags ?? [],
            flairs: row.flairs ?? [],
            postType: row.postType ?? undefined,
          }),
      ),
      cursor: keyset.packFromResult(posts),
    })
  },

  async getParaCommunitySharedContent(req) {
    if (req.includeRemoved) {
      await assertCommunitySteward(db, {
        communityUri: req.communityUri,
        viewerDid: req.viewerDid,
      })
    }

    const communityUris = req.includeChildren
      ? await getCommunityAndChildren(db, req.communityUri)
      : [req.communityUri]

    if (!req.communityUri || communityUris.length === 0) {
      return new GetParaCommunitySharedContentResponse({ items: [] })
    }

    const { ref } = db.db.dynamic
    const keyset = new CreatedAtCidKeyset(
      ref('share.createdAt'),
      ref('share.cid'),
    )

    let builder = db.db
      .selectFrom('para_community_shared_content as share')
      .leftJoin('actor as actor', 'actor.did', 'share.sharedBy')
      .where('share.communityUri', 'in', communityUris)
      .selectAll('share')
      .select('actor.handle as sharedByHandle')

    if (req.contentType) {
      builder = builder.where('share.contentType', '=', req.contentType)
    }

    builder = paginate(builder, {
      limit: normalizeLimit(req.limit) + 1,
      cursor: req.cursor,
      keyset,
      tryIndex: true,
    })

    const rows = await builder.execute()
    const actionMap = await getLatestSharedContentActions(db, rows)

    const visible = rows.filter((row) => {
      if (req.includeRemoved) return true
      return !isRemovedAction(actionMap.get(row.uri)?.action)
    })
    const page = visible.slice(0, normalizeLimit(req.limit))
    const hasMore = visible.length > page.length || rows.length > page.length

    return new GetParaCommunitySharedContentResponse({
      items: page.map((row) =>
        toSharedContentView(row, actionMap.get(row.uri), req.communityUri),
      ),
      cursor: hasMore ? (keyset.packFromResult(page) ?? '') : '',
    })
  },

  async getParaCommunityRelations(req) {
    const { ref } = db.db.dynamic
    const keyset = new CreatedAtCidKeyset(
      ref('relation.createdAt'),
      ref('relation.cid'),
    )

    let builder = db.db
      .selectFrom('para_community_relation as relation')
      .selectAll('relation')
      .where(relationAuthorCandidateSql('relation'))

    if (req.communityUri) {
      builder = builder.where(
        sql<boolean>`(
          "relation"."parentCommunityUri" = ${req.communityUri}
          or "relation"."childCommunityUri" = ${req.communityUri}
        )`,
      )
    }
    if (req.parentCommunityUri) {
      builder = builder.where(
        'relation.parentCommunityUri',
        '=',
        req.parentCommunityUri,
      )
    }
    if (req.childCommunityUri) {
      builder = builder.where(
        'relation.childCommunityUri',
        '=',
        req.childCommunityUri,
      )
    }
    if (req.relation) {
      builder = builder.where('relation.relation', '=', req.relation)
    }

    builder = paginate(builder, {
      limit: normalizeLimit(req.limit) + 1,
      cursor: req.cursor,
      keyset,
      tryIndex: true,
    })

    const rows = await builder.execute()
    const raw = rows.slice(0, normalizeLimit(req.limit))
    // The SQL filter is only a cheap necessary condition; the page can come
    // back short, but the cursor still follows the rows that were read.
    const trusted = new Set(
      (await filterTrustedRelations(db, raw)).map((row) => row.uri),
    )
    const page = raw.filter((row) => trusted.has(row.uri))

    return new GetParaCommunityRelationsResponse({
      relations: page.map((row) => toRelationView(row)),
      cursor:
        rows.length > raw.length ? (keyset.packFromResult(raw) ?? '') : '',
    })
  },
})

const selectBoard = async (
  db: Database,
  communityId?: string,
  uri?: string,
): Promise<BoardRow | undefined> => {
  if (uri && communityAccountDid(uri)) {
    return selectCommunityAccount(db, uri)
  }
  const board = await selectLegacyBoard(db, communityId, uri)
  return board ?? selectCommunityAccount(db, uri ?? communityId)
}

/**
 * An OD-9 community account in the shape of a board row, so views serve both
 * until phase 5 retires boards. Its creator is the founder; its moderator
 * count comes from the folded chain, not a governance record.
 */
const selectCommunityAccount = async (
  db: Database,
  ref?: string,
): Promise<BoardRow | undefined> => {
  const [uri] = await resolveCommunityAccountUris(db, ref)
  const did = uri ? communityAccountDid(uri) : null
  if (!uri || !did) return undefined
  const [row, founder, moderators] = await Promise.all([
    db.db
      .selectFrom('para_community_account as account')
      .leftJoin('actor', 'actor.did', 'account.did')
      .where('account.did', '=', did)
      .selectAll('account')
      .select('actor.handle as handle')
      .executeTakeFirst(),
    db.db
      .selectFrom('para_community_chain_event as event')
      .leftJoin('actor', 'actor.did', 'event.actor')
      .where('event.community', '=', did)
      .where('event.seq', '=', 1)
      .where('event.status', '=', 'applied')
      .select(['event.actor', 'actor.handle'])
      .executeTakeFirst(),
    accountOfficeHolders(db, did, 'moderator'),
  ])
  if (!row) return undefined
  const slug = row.handle?.split('.')[0] ?? ''
  return {
    uri,
    cid: row.profileCid ?? '',
    creator: founder?.actor ?? did,
    slug,
    name: row.name ?? slug,
    description: row.description,
    quadrant: row.quadrant ?? '',
    region: row.region,
    delegatesChatId: '',
    subdelegatesChatId: '',
    createdAt: row.createdAt ?? row.indexedAt,
    indexedAt: row.indexedAt,
    creatorHandle: founder?.handle ?? null,
    creatorDisplayName: null,
    state: row.broken ? 'frozen' : 'active',
    matterFlairIds: null,
    policyFlairIds: null,
    moderatorCount: moderators.length,
    officialCount: 0,
    deputyRoleCount: 0,
    lastPublishedAt: null,
    governanceMode: row.governanceMode,
    admissionMode: row.admissionMode ?? 'open',
  }
}

const selectLegacyBoard = async (
  db: Database,
  communityId?: string,
  uri?: string,
): Promise<BoardRow | undefined> => {
  let builder = boardBaseQuery(db)

  if (uri) {
    builder = builder.where('board.uri', '=', uri)
  } else if (communityId) {
    const normalizedCommunity = normalizeCommunitySlug(communityId)
    builder = builder.where(
      sql<boolean>`(
        "board"."uri" = ${communityId}
        or "board"."slug" = ${communityId}
        or "board"."slug" = ${normalizedCommunity}
        or regexp_replace(lower(coalesce("board"."name", '')), '[^a-z0-9]+', '-', 'g') = ${normalizedCommunity}
      )`,
    )
  } else {
    return undefined
  }

  return (await builder.executeTakeFirst()) as BoardRow | undefined
}

const selectBoardPostIdentity = async (
  db: Database,
  communityId?: string,
): Promise<Pick<BoardRow, 'name' | 'slug'> | undefined> => {
  if (!communityId) return undefined
  const normalizedCommunity = normalizeCommunitySlug(communityId)

  return db.db
    .selectFrom('para_community_board as board')
    .where(
      sql<boolean>`(
        "board"."uri" = ${communityId}
        or "board"."slug" = ${communityId}
        or "board"."slug" = ${normalizedCommunity}
        or regexp_replace(lower(coalesce("board"."name", '')), '[^a-z0-9]+', '-', 'g') = ${normalizedCommunity}
      )`,
    )
    .select(['board.name', 'board.slug'])
    .executeTakeFirst()
}

const MAX_OFFSET = 1000

const isOffsetCursor = (cursor?: string): boolean => {
  if (!cursor) return false
  const parsed = Number.parseInt(cursor, 10)
  return Number.isFinite(parsed) && parsed >= 0 && String(parsed) === cursor
}

const selectBoards = async (
  db: Database,
  opts: {
    limit: number
    cursor?: string
    query?: string
    state?: string
    participationKind?: string
    flairId?: string
    sort?: string
    quadrant?: string
    region?: string
  },
): Promise<{ boards: BoardRow[]; cursor: string }> => {
  let builder = boardBaseQuery(db)

  if (opts.quadrant) {
    builder = builder.where('board.quadrant', '=', opts.quadrant)
  }

  const region = opts.region?.trim()
  if (region) {
    builder = builder.where('board.region', '=', region)
  }

  const state = opts.state?.trim()
  if (state) {
    builder = builder.where('gov.state', '=', state)
  }

  const flairId = opts.flairId?.trim()
  if (flairId) {
    if (opts.participationKind === 'matter') {
      builder = builder.where(sql<boolean>`gov."matterFlairIds" ? ${flairId}`)
    } else if (opts.participationKind === 'policy') {
      builder = builder.where(sql<boolean>`gov."policyFlairIds" ? ${flairId}`)
    }
  }

  const query = opts.query?.trim()
  if (query) {
    const like = `%${query.replace(/[%_]/g, '\\$&')}%`
    builder = builder.where(
      sql<boolean>`(
        "board"."name" ilike ${like}
        or "board"."description" ilike ${like}
        or "board"."slug" ilike ${like}
        or "board"."quadrant" ilike ${like}
      )`,
    )
  }

  const sort = opts.sort

  // Subquery-based sorts (size) cannot use keyset cursors efficiently.
  // Fall back to offset with a hard cap to prevent deep-paging abuse.
  if (sort === 'size') {
    const pageOffset = Math.min(decodeOffsetCursor(opts.cursor), MAX_OFFSET)
    const ordered = builder.orderBy(
      (eb) =>
        eb
          .selectFrom('para_community_membership')
          .whereRef('communityUri', '=', 'board.uri')
          .where('membershipState', '=', 'active')
          .select(sql<number>`count(*)`.as('memberCount')),
      'desc',
    )

    const rows = (await ordered
      .orderBy('board.cid', 'desc')
      .offset(pageOffset)
      .limit(opts.limit + 1)
      .execute()) as BoardRow[]

    const page = rows.slice(0, opts.limit)
    const hasMore = rows.length > opts.limit && pageOffset < MAX_OFFSET
    const nextOffset = pageOffset + page.length

    return {
      boards: page,
      cursor: hasMore ? encodeOffsetCursor(nextOffset) : '',
    }
  }

  // Cursor-based pagination for createdAt / indexedAt sorts
  const { ref } = db.db.dynamic
  const keyset =
    sort === 'activity'
      ? new IndexedAtCidKeyset(ref('board.indexedAt'), ref('board.cid'))
      : new CreatedAtCidKeyset(ref('board.createdAt'), ref('board.cid'))

  // Gracefully degrade old offset cursors to first page
  const cursor = isOffsetCursor(opts.cursor) ? undefined : opts.cursor

  builder = paginate(builder, {
    limit: opts.limit + 1,
    cursor,
    keyset,
    tryIndex: true,
  })

  const rows = (await builder.execute()) as BoardRow[]
  const page = rows.slice(0, opts.limit)
  const hasMore = rows.length > opts.limit

  return {
    boards: page,
    cursor: hasMore ? (keyset.packFromResult(page) ?? '') : '',
  }
}

const boardBaseQuery = (db: Database) =>
  db.db
    .selectFrom('para_community_board as board')
    .leftJoin('actor as actor', 'actor.did', 'board.creator')
    // The board's trusted governance record only: see community-governance.ts.
    .leftJoinLateral(
      (eb) =>
        eb
          .selectFrom('para_community_governance as candidate')
          .where(isTrustedBoardGovernanceSql('candidate', 'board'))
          .orderBy(governanceSlugMatchSql('candidate', 'board'), 'desc')
          .orderBy('candidate.indexedAt', 'desc')
          .limit(1)
          .selectAll('candidate')
          .as('gov'),
      (join) => join.onTrue(),
    )
    .select([
      'board.uri',
      'board.cid',
      'board.creator',
      'board.slug',
      'board.name',
      'board.description',
      'board.quadrant',
      'board.region',
      'board.delegatesChatId',
      'board.subdelegatesChatId',
      'board.governanceMode',
      'board.admissionMode',
      'board.createdAt',
      'board.indexedAt',
      'gov.state',
      'gov.matterFlairIds',
      'gov.policyFlairIds',
      'gov.moderatorCount',
      'gov.officialCount',
      'gov.deputyRoleCount',
      'gov.lastPublishedAt',
    ])
    .select('actor.handle as creatorHandle')
    .select(sql<string | null>`null`.as('creatorDisplayName'))

const getMemberCounts = (db: Database, communityUris: string[]) =>
  countActiveMembers(db, communityUris)

const getSharedContentCounts = async (
  db: Database,
  communityUris: string[],
) => {
  if (communityUris.length === 0) {
    return new Map<string, number>()
  }

  const rows = await db.db
    .selectFrom('para_community_shared_content as share')
    .where('share.communityUri', 'in', communityUris)
    .select(['share.communityUri', sql<number>`count(*)`.as('shareCount')])
    .groupBy('share.communityUri')
    .execute()

  return new Map(
    rows.map((row) => [row.communityUri, Number(row.shareCount) || 0]),
  )
}

const getChildCommunityCounts = async (
  db: Database,
  communityUris: string[],
) => {
  if (communityUris.length === 0) {
    return new Map<string, number>()
  }

  const rows = await selectParentChildRelations(
    db,
    'parentCommunityUri',
    communityUris,
  )
  // Two trusted authors (say, co-owners) may each link the same pair.
  const children = new Map<string, Set<string>>()
  for (const row of rows) {
    const set = children.get(row.parentCommunityUri) ?? new Set()
    set.add(row.childCommunityUri)
    children.set(row.parentCommunityUri, set)
  }
  return new Map(
    [...children].map(([parent, set]) => [parent, set.size] as const),
  )
}

const getParentCommunityUris = async (
  db: Database,
  communityUris: string[],
) => {
  if (communityUris.length === 0) {
    return new Map<string, string[]>()
  }

  const rows = await selectParentChildRelations(
    db,
    'childCommunityUri',
    communityUris,
  )

  const result = new Map<string, string[]>()
  for (const row of rows) {
    const existing = result.get(row.childCommunityUri) ?? []
    if (!existing.includes(row.parentCommunityUri)) {
      existing.push(row.parentCommunityUri)
    }
    result.set(row.childCommunityUri, existing)
  }
  return result
}

const getCommunityAndChildren = async (
  db: Database,
  communityUri: string,
): Promise<string[]> => {
  if (!communityUri) return []
  const rows = await selectParentChildRelations(db, 'parentCommunityUri', [
    communityUri,
  ])

  return [communityUri, ...new Set(rows.map((row) => row.childCommunityUri))]
}

type RelationRow = Selectable<DatabaseSchemaType['para_community_relation']>

/**
 * A relation record lives in its author's repo, and anyone can write one
 * naming any two communities. It counts only if its author owned the parent
 * community when the AppView indexed it, or, for a horizontal parent (which
 * has no owner), founded it. The child's side is not consulted: in the normal
 * case the child's owner is the one linking it.
 */
const filterTrustedRelations = async <
  T extends Pick<RelationRow, 'parentCommunityUri' | 'creator' | 'indexedAt'>,
>(
  db: Database,
  rows: readonly T[],
): Promise<T[]> => {
  if (rows.length === 0) return []
  const parents = [...new Set(rows.map((row) => row.parentCommunityUri))]
  const horizontalFounders = new Set(
    (
      await db.db
        .selectFrom('para_community_board')
        .where('uri', 'in', parents)
        .where('governanceMode', '=', 'horizontal')
        .select(['uri', 'creator'])
        .execute()
    ).map((board) => `${board.uri} ${board.creator}`),
  )
  const byFounder = rows.filter((row) =>
    horizontalFounders.has(`${row.parentCommunityUri} ${row.creator}`),
  )
  const byOwner = await filterByOfficeWhenIndexed(
    db,
    rows.filter((row) => !byFounder.includes(row)),
    (row) => ({
      community: row.parentCommunityUri,
      author: row.creator,
      indexedAt: row.indexedAt,
    }),
    ['owner'],
  )
  const trusted = new Set([...byFounder, ...byOwner])
  return rows.filter((row) => trusted.has(row))
}

/**
 * Necessary condition for `filterTrustedRelations`, cheap enough for SQL: the
 * author has some owner grant in the parent, or created the parent board.
 */
const relationAuthorCandidateSql = (alias: string) => {
  const ref = (column: string) => sql.ref(`${alias}.${column}`)
  return sql<boolean>`(
    exists (
      select 1 from para_community_authority_event grant_event
      where grant_event."communityUri" = ${ref('parentCommunityUri')}
        and grant_event.subject = ${ref('creator')}
        and grant_event.action = 'owner.grant'
    )
    or exists (
      select 1 from para_community_board parent_board
      where parent_board.uri = ${ref('parentCommunityUri')}
        and parent_board.creator = ${ref('creator')}
    )
  )`
}

/** Trusted `parentChild` relations whose `side` is one of `uris`. */
const selectParentChildRelations = async (
  db: Database,
  side: 'parentCommunityUri' | 'childCommunityUri',
  uris: string[],
) => {
  if (uris.length === 0) return []
  const rows = await db.db
    .selectFrom('para_community_relation as relation')
    .where('relation.relation', '=', 'parentChild')
    .where(`relation.${side}`, 'in', uris)
    .where(relationAuthorCandidateSql('relation'))
    .select([
      'relation.parentCommunityUri',
      'relation.childCommunityUri',
      'relation.creator',
      'relation.indexedAt',
    ])
    .execute()
  return filterTrustedRelations(db, rows)
}

/**
 * The latest moderation action on each shared item, counting only actions by
 * an owner or moderator of the item's own community. Anyone can write a
 * `sharedContentAction` record into their repo, so an action from any other
 * author, or one naming a different community, is ignored.
 *
 * Authority is judged at the action's `indexedAt`, which its author cannot
 * choose: a moderator's past removals survive the end of their term, and a
 * revoked moderator cannot backdate new ones. For ordering, `createdAt` is
 * capped at `indexedAt`, so a future date cannot pin an action on top.
 */
const getLatestSharedContentActions = async (
  db: Database,
  shares: ReadonlyArray<{ uri: string; communityUri: string }>,
) => {
  const result = new Map<string, SharedContentActionRow>()
  if (shares.length === 0) return result

  const communityOf = new Map(
    shares.map((share) => [share.uri, share.communityUri]),
  )
  const rows = await db.db
    .selectFrom('para_community_shared_content_action')
    .where('sharedContentUri', 'in', [...communityOf.keys()])
    .selectAll()
    .execute()
  const candidates = rows.filter(
    (row) => communityOf.get(row.sharedContentUri) === row.communityUri,
  )
  const authorized = await filterByOfficeWhenIndexed(
    db,
    candidates,
    (row) => ({
      community: row.communityUri,
      author: row.creator,
      indexedAt: row.indexedAt,
    }),
    ['owner', 'moderator'],
  )

  const effectiveTime = (row: SharedContentActionRow) =>
    Math.min(Date.parse(row.createdAt), Date.parse(row.indexedAt))
  authorized.sort(
    (a, b) =>
      effectiveTime(b) - effectiveTime(a) ||
      (a.cid < b.cid ? 1 : a.cid > b.cid ? -1 : 0),
  )
  for (const row of authorized) {
    if (!result.has(row.sharedContentUri)) {
      result.set(row.sharedContentUri, row)
    }
  }
  return result
}

type SharedContentActionRow = Selectable<
  DatabaseSchemaType['para_community_shared_content_action']
>

const isRemovedAction = (action?: string) => action === 'remove'

const toSharedContentView = (
  row: any,
  action: any | undefined,
  requestedCommunityUri: string,
) => {
  const removed = isRemovedAction(action?.action)
  return new ParaCommunitySharedContentView({
    uri: row.uri,
    cid: row.cid,
    subject: new ParaStrongRef({
      uri: row.subjectUri,
      cid: row.subjectCid,
    }),
    communityUri: requestedCommunityUri,
    sourceCommunityUri: row.communityUri,
    contentType: row.contentType,
    sharedBy: row.sharedBy,
    sharedByHandle: row.sharedByHandle ?? '',
    note: row.note ?? '',
    visibility: row.visibility ?? '',
    sourceApp: row.sourceApp ?? '',
    pinned: Boolean(row.pinned),
    sortRank: row.sortRank ?? 0,
    createdAt: row.createdAt,
    removed,
    removedAt: removed ? (action?.createdAt ?? '') : '',
    removedBy: removed ? (action?.creator ?? '') : '',
    latestAction: action ? toSharedContentActionView(action) : undefined,
    hydrationState: 'unresolved',
  })
}

const toSharedContentActionView = (row: any) =>
  new ParaSharedContentActionView({
    uri: row.uri,
    cid: row.cid,
    sharedContent: new ParaStrongRef({
      uri: row.sharedContentUri,
      cid: row.sharedContentCid,
    }),
    communityUri: row.communityUri,
    action: row.action,
    note: row.note ?? '',
    createdAt: row.createdAt,
    createdBy: row.creator,
  })

const toRelationView = (row: any) =>
  new ParaCommunityRelationView({
    uri: row.uri,
    cid: row.cid,
    parentCommunityUri: row.parentCommunityUri,
    childCommunityUri: row.childCommunityUri,
    relation: row.relation,
    createdAt: row.createdAt,
    createdBy: row.creator,
  })

const getViewerMemberships = async (
  db: Database,
  viewerDid: string,
  communityUris: string[],
) => {
  if (!viewerDid || communityUris.length === 0) {
    return new Map<string, MembershipRow>()
  }

  const snapshots = await Promise.all(
    communityUris.map(
      async (communityUri) =>
        [
          communityUri,
          await getAuthoritySnapshot(db, communityUri, viewerDid),
        ] as const,
    ),
  )
  return new Map(
    snapshots.map(([communityUri, snapshot]) => [
      communityUri,
      {
        communityUri,
        creator: viewerDid,
        membershipState: snapshot.membershipState,
        roles: snapshot.roles,
        roleAssignments: null,
      },
    ]),
  )
}

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

const assertCommunitySteward = async (
  db: Database,
  opts: { communityUri: string; viewerDid: string },
) => {
  if (!opts.viewerDid) {
    throw new ConnectError(
      'Community steward authentication is required',
      Code.Unauthenticated,
    )
  }

  const authority = await getAuthoritySnapshot(
    db,
    opts.communityUri,
    opts.viewerDid,
  )
  const isSteward = authority.roles.some((role) =>
    ['owner', 'moderator'].includes(role),
  )
  if (!isSteward) {
    throw new ConnectError(
      'Community steward role is required',
      Code.PermissionDenied,
    )
  }
}

const toBoardView = (
  board: BoardRow,
  memberCount: number,
  viewerMembership?: MembershipRow,
  summary?: {
    parentCommunityUris?: string[]
    childCommunityCount?: number
    sharedContentCount?: number
  },
) =>
  new ParaCommunityBoardView({
    uri: board.uri,
    cid: board.cid,
    creatorDid: board.creator,
    creatorHandle: board.creatorHandle ?? '',
    creatorDisplayName: board.creatorDisplayName ?? '',
    communityId: board.slug ?? board.name ?? '',
    slug: board.slug ?? '',
    name: board.name ?? '',
    description: board.description ?? '',
    quadrant: board.quadrant ?? '',
    delegatesChatId: board.delegatesChatId ?? '',
    subdelegatesChatId: board.subdelegatesChatId ?? '',
    memberCount,
    viewerMembershipState: viewerMembership?.membershipState ?? 'none',
    viewerRoles: viewerMembership?.roles ?? [],
    status: board.state ?? undefined,
    governanceSummary: {
      moderatorCount: board.moderatorCount ?? 0,
      officialCount: board.officialCount ?? 0,
      deputyRoleCount: board.deputyRoleCount ?? 0,
      lastPublishedAt: board.lastPublishedAt ?? undefined,
    },
    createdAt: board.createdAt,
    parentCommunityUris: summary?.parentCommunityUris ?? [],
    childCommunityCount: summary?.childCommunityCount ?? 0,
    sharedContentCount: summary?.sharedContentCount ?? 0,
    governanceMode: board.governanceMode ?? 'hierarchical',
    admissionMode: board.admissionMode,
    region: board.region ?? '',
  })

const selectMembers = async (
  db: Database,
  communityUri: string,
  opts: {
    membershipState?: string
    role?: string
    sort?: string
    limit: number
    cursor?: string
  },
) => {
  if (communityAccountDid(communityUri)) {
    return selectAccountMembers(db, communityUri, opts)
  }
  const requestedState = opts.membershipState?.trim() || 'active'
  let builder = db.db
    .selectFrom('para_community_membership as membership')
    .leftJoin('actor as actor', 'actor.did', 'membership.creator')
    .leftJoin('profile as profile', 'profile.creator', 'membership.creator')
    .where('membership.communityUri', '=', communityUri)
    .where('membership.membershipState', '=', requestedState)
    .select([
      'membership.creator as did',
      'membership.cid',
      'membership.membershipState',
      'membership.joinedAt',
      'actor.handle as handle',
      'profile.displayName as displayName',
    ])

  const role = opts.role?.trim()
  if (role) {
    if (role === 'member') {
      builder = builder.where('membership.membershipState', '=', 'active')
    } else if (role === 'moderator' || role === 'owner') {
      const grant = `${role}.grant`
      const terminal =
        role === 'moderator'
          ? ['moderator.revoke', 'moderator.resign']
          : ['owner.revoke']
      builder = builder.where(
        sql<boolean>`exists (
          select 1 from para_community_authority_event granted
          where granted."communityUri" = "membership"."communityUri"
            and granted.subject = "membership".creator
            and granted.action = ${grant}
            and granted."effectiveAt"::timestamptz <= now()
            and (granted."expiresAt" is null or granted."expiresAt"::timestamptz > now())
            and not exists (
              select 1 from para_community_authority_event terminal
              where terminal."communityUri" = granted."communityUri"
                and terminal.subject = granted.subject
                and terminal.action in (${sql.join(terminal)})
                and terminal.version > granted.version
            )
        )`,
      )
    } else {
      builder = builder.where(sql<boolean>`false`)
    }
  }

  // Subquery-based sorts (participation) cannot use keyset cursors efficiently.
  // Fall back to offset with a hard cap to prevent deep-paging abuse.
  // Replace correlated subquery with LEFT JOIN to pre-aggregated vote counts
  // for O(n + m) hash join instead of O(n × m) correlated execution.
  if (opts.sort === 'participation') {
    const offset = Math.min(decodeOffsetCursor(opts.cursor), MAX_OFFSET)

    const voteCountsSubquery = db.db
      .selectFrom('cabildeo_vote')
      .select(['creator', sql<number>`count(*)`.as('voteCount')])
      .groupBy('creator')

    builder = builder
      .leftJoin(
        voteCountsSubquery.as('vote_counts'),
        'vote_counts.creator',
        'membership.creator',
      )
      .orderBy(sql`coalesce("vote_counts"."voteCount", 0)`, 'desc')
      .orderBy('membership.cid', 'desc')

    const rows = await builder
      .offset(offset)
      .limit(opts.limit + 1)
      .execute()
    const page = rows.slice(0, opts.limit)
    const dids = page.map((row) => row.did)
    const [voteCounts, delegationCounts, postCounts, authorities] =
      await Promise.all([
        getVoteCounts(db, dids),
        getDelegationCounts(db, dids),
        getCommunityPostCounts(db, dids, communityUri),
        Promise.all(
          dids.map(
            async (did) =>
              [did, await getAuthoritySnapshot(db, communityUri, did)] as const,
          ),
        ),
      ])
    const authorityByDid = new Map(authorities)

    return {
      members: page.map((row) => {
        const postCount = postCounts.get(row.did)
        return {
          did: row.did,
          handle: row.handle ?? '',
          displayName: row.displayName ?? '',
          avatar: '',
          membershipState:
            authorityByDid.get(row.did)?.membershipState ?? row.membershipState,
          roles: authorityByDid.get(row.did)?.roles ?? [],
          joinedAt: row.joinedAt,
          votesCast: voteCounts.get(row.did) ?? 0,
          delegationsReceived: delegationCounts.get(row.did) ?? 0,
          policyPosts: postCount?.policyPosts ?? 0,
          matterPosts: postCount?.matterPosts ?? 0,
        }
      }),
      cursor:
        rows.length > opts.limit && offset < MAX_OFFSET
          ? encodeOffsetCursor(offset + page.length)
          : '',
    }
  }

  // Cursor-based pagination for joinedAt sort
  const { ref } = db.db.dynamic
  const keyset = new JoinedAtCidKeyset(
    ref('membership.joinedAt'),
    ref('membership.cid'),
  )

  // Gracefully degrade old offset cursors to first page
  const cursor = isOffsetCursor(opts.cursor) ? undefined : opts.cursor

  builder = paginate(builder, {
    limit: opts.limit + 1,
    cursor,
    keyset,
    tryIndex: true,
  })

  const rows = await builder.execute()
  const page = rows.slice(0, opts.limit)
  const dids = page.map((row) => row.did)
  const [voteCounts, delegationCounts, postCounts, authorities] =
    await Promise.all([
      getVoteCounts(db, dids),
      getDelegationCounts(db, dids),
      getCommunityPostCounts(db, dids, communityUri),
      Promise.all(
        dids.map(
          async (did) =>
            [did, await getAuthoritySnapshot(db, communityUri, did)] as const,
        ),
      ),
    ])
  const authorityByDid = new Map(authorities)

  return {
    members: page.map((row) => {
      const postCount = postCounts.get(row.did)
      return {
        did: row.did,
        handle: row.handle ?? '',
        displayName: row.displayName ?? '',
        avatar: '',
        membershipState:
          authorityByDid.get(row.did)?.membershipState ?? row.membershipState,
        roles: authorityByDid.get(row.did)?.roles ?? [],
        joinedAt: row.joinedAt,
        votesCast: voteCounts.get(row.did) ?? 0,
        delegationsReceived: delegationCounts.get(row.did) ?? 0,
        policyPosts: postCount?.policyPosts ?? 0,
        matterPosts: postCount?.matterPosts ?? 0,
      }
    }),
    cursor: rows.length > opts.limit ? (keyset.packFromResult(page) ?? '') : '',
  }
}

/**
 * `selectMembers` for an OD-9 account, from its folded chain. States are as
 * of now: a suspension whose end has passed lists as active.
 */
const selectAccountMembers = async (
  db: Database,
  communityUri: string,
  opts: {
    membershipState?: string
    role?: string
    sort?: string
    limit: number
    cursor?: string
  },
) => {
  const communityDid = communityAccountDid(communityUri)!
  const requestedState = opts.membershipState?.trim() || 'active'
  const role = opts.role?.trim()
  let builder = db.db
    .selectFrom('para_community_member_state as member')
    .leftJoin('actor as actor', 'actor.did', 'member.did')
    .leftJoin('profile as profile', 'profile.creator', 'member.did')
    .where('member.community', '=', communityDid)
    .select([
      'member.did as did',
      'member.did as cid',
      sql<string>`coalesce(member."joinedAt", '')`.as('joinedAt'),
      'actor.handle as handle',
      'profile.displayName as displayName',
    ])
  if (requestedState === 'active') {
    builder = builder.where(effectivelyActiveSql('member'))
  } else if (requestedState === 'suspended') {
    builder = builder
      .where('member.status', '=', 'suspended')
      .where(sql<boolean>`member."suspendedUntil"::timestamptz > now()`)
  } else if (requestedState === 'left') {
    builder = builder.where('member.status', '=', 'left')
  } else {
    builder = builder.where(sql<boolean>`false`)
  }
  if (role === 'member') {
    builder = builder.where(effectivelyActiveSql('member'))
  } else if (role === 'moderator' || role === 'owner') {
    builder = builder
      .where(effectivelyActiveSql('member'))
      .where(sql<boolean>`member.offices ? ${role}`)
  } else if (role) {
    builder = builder.where(sql<boolean>`false`)
  }

  let rows: Array<{
    did: string
    cid: string
    joinedAt: string
    handle: string | null
    displayName: string | null
  }>
  let cursor: string
  if (opts.sort === 'participation') {
    const offset = Math.min(decodeOffsetCursor(opts.cursor), MAX_OFFSET)
    const voteCounts = db.db
      .selectFrom('cabildeo_vote')
      .select(['creator', sql<number>`count(*)`.as('voteCount')])
      .groupBy('creator')
    const found = await builder
      .leftJoin(
        voteCounts.as('vote_counts'),
        'vote_counts.creator',
        'member.did',
      )
      .orderBy(sql`coalesce("vote_counts"."voteCount", 0)`, 'desc')
      .orderBy('member.did', 'desc')
      .offset(offset)
      .limit(opts.limit + 1)
      .execute()
    rows = found.slice(0, opts.limit)
    cursor =
      found.length > opts.limit && offset < MAX_OFFSET
        ? encodeOffsetCursor(offset + rows.length)
        : ''
  } else {
    const { ref } = db.db.dynamic
    const keyset = new JoinedAtCidKeyset(
      ref('member.joinedAt'),
      ref('member.did'),
    )
    const found = await paginate(builder, {
      limit: opts.limit + 1,
      cursor: isOffsetCursor(opts.cursor) ? undefined : opts.cursor,
      keyset,
      tryIndex: true,
    }).execute()
    rows = found.slice(0, opts.limit)
    cursor =
      found.length > opts.limit ? (keyset.packFromResult(rows) ?? '') : ''
  }

  const dids = rows.map((row) => row.did)
  const [voteCounts, delegationCounts, postCounts, authorities] =
    await Promise.all([
      getVoteCounts(db, dids),
      getDelegationCounts(db, dids),
      getCommunityPostCounts(db, dids, communityUri),
      getAuthoritySnapshots(db, communityUri, dids),
    ])
  return {
    members: rows.map((row) => {
      const postCount = postCounts.get(row.did)
      const authority = authorities.get(row.did)
      return {
        did: row.did,
        handle: row.handle ?? '',
        displayName: row.displayName ?? '',
        avatar: '',
        membershipState:
          authority?.membershipState === 'none'
            ? 'left'
            : (authority?.membershipState ?? requestedState),
        roles: authority?.roles ?? [],
        joinedAt: row.joinedAt,
        votesCast: voteCounts.get(row.did) ?? 0,
        delegationsReceived: delegationCounts.get(row.did) ?? 0,
        policyPosts: postCount?.policyPosts ?? 0,
        matterPosts: postCount?.matterPosts ?? 0,
      }
    }),
    cursor,
  }
}

const getVoteCounts = async (db: Database, dids: string[]) => {
  if (dids.length === 0) return new Map<string, number>()

  const rows = await db.db
    .selectFrom('cabildeo_vote')
    .where('creator', 'in', dids)
    .select(['creator', sql<number>`count(*)`.as('count')])
    .groupBy('creator')
    .execute()

  return new Map(rows.map((row) => [row.creator, Number(row.count) || 0]))
}

const getDelegationCounts = async (db: Database, dids: string[]) => {
  if (dids.length === 0) return new Map<string, number>()

  const rows = await db.db
    .selectFrom('cabildeo_delegation')
    .where('delegateTo', 'in', dids)
    .select(['delegateTo', sql<number>`count(distinct "creator")`.as('count')])
    .groupBy('delegateTo')
    .execute()

  return new Map(rows.map((row) => [row.delegateTo, Number(row.count) || 0]))
}

const getCommunityPostCounts = async (
  db: Database,
  dids: string[],
  communityUri: string,
) => {
  if (dids.length === 0) {
    return new Map<string, { policyPosts: number; matterPosts: number }>()
  }

  const accountDid = communityAccountDid(communityUri)
  const board = accountDid
    ? await db.db
        .selectFrom('actor')
        .where('did', '=', accountDid)
        .select(sql<string>`split_part(handle, '.', 1)`.as('slug'))
        .select(sql<string>`''`.as('name'))
        .executeTakeFirst()
    : await db.db
        .selectFrom('para_community_board')
        .where('uri', '=', communityUri)
        .select(['name', 'slug'])
        .executeTakeFirst()

  const community = board
    ? normalizeCommunitySlug(board.slug || board.name)
    : ''
  // A community with no name to match counts no posts, rather than all.
  if (!community) {
    return new Map<string, { policyPosts: number; matterPosts: number }>()
  }
  let builder = db.db
    .selectFrom('para_post')
    .where('creator', 'in', dids)
    .select(['creator'])
    .select(
      sql<number>`coalesce(sum(case when "postType" = 'policy' then 1 else 0 end), 0)`.as(
        'policyPosts',
      ),
    )
    .select(
      sql<number>`coalesce(sum(case when "postType" = 'matter' then 1 else 0 end), 0)`.as(
        'matterPosts',
      ),
    )
    .groupBy('creator')

  if (community) {
    builder = builder.where(
      sql`regexp_replace(lower(coalesce("community", '')), '[^a-z0-9]+', '-', 'g')`,
      '=',
      community,
    )
  }

  const rows = await builder.execute()

  return new Map(
    rows.map((row) => [
      row.creator,
      {
        policyPosts: Number(row.policyPosts) || 0,
        matterPosts: Number(row.matterPosts) || 0,
      },
    ]),
  )
}

const getGovernanceSummary = async (
  db: Database,
  board: GovernanceBoard & { moderatorCount?: number | null },
): Promise<ParaCommunityGovernanceSummary | null> => {
  // An OD-9 account's summary is its folded chain's (see selectCommunityAccount).
  if (communityAccountDid(board.uri)) {
    return new ParaCommunityGovernanceSummary({
      moderatorCount: board.moderatorCount ?? 0,
      officialCount: 0,
      deputyRoleCount: 0,
    })
  }
  const record = await getPublishedGovernanceRecord(db, board)
  if (!record) return null

  return new ParaCommunityGovernanceSummary({
    moderatorCount: record.moderators.length,
    officialCount: record.officials.length,
    deputyRoleCount: record.deputies.length,
    lastPublishedAt:
      record.metadata?.lastPublishedAt || record.updatedAt || record.createdAt,
  })
}

const getCommunityCounters = async (
  db: Database,
  community: string,
): Promise<{
  members: number
  visiblePosters: number
  policyPosts: number
  matterPosts: number
  badgeHolders: number
}> => {
  const [members, posters, posts, postMeta, badges] = await Promise.all([
    db.db
      .selectFrom('para_status')
      .where(
        sql`regexp_replace(lower(coalesce("community", '')), '[^a-z0-9]+', '-', 'g')`,
        '=',
        community,
      )
      .select(countAll.as('count'))
      .executeTakeFirst(),
    db.db
      .selectFrom('para_post')
      .where(
        sql`regexp_replace(lower(coalesce("community", '')), '[^a-z0-9]+', '-', 'g')`,
        '=',
        community,
      )
      .select(sql<number>`count(distinct "creator")`.as('count'))
      .executeTakeFirst(),
    db.db
      .selectFrom('para_post')
      .where(
        sql`regexp_replace(lower(coalesce("community", '')), '[^a-z0-9]+', '-', 'g')`,
        '=',
        community,
      )
      .select(
        sql<number>`coalesce(sum(case when "postType" = 'policy' then 1 else 0 end), 0)`.as(
          'policyPosts',
        ),
      )
      .select(
        sql<number>`coalesce(sum(case when "postType" = 'matter' then 1 else 0 end), 0)`.as(
          'matterPosts',
        ),
      )
      .executeTakeFirst(),
    db.db
      .selectFrom('para_post_meta')
      .where(
        sql`regexp_replace(lower(coalesce("community", '')), '[^a-z0-9]+', '-', 'g')`,
        '=',
        community,
      )
      .select(
        sql<number>`coalesce(sum(case when "postType" = 'policy' then 1 else 0 end), 0)`.as(
          'policyPosts',
        ),
      )
      .select(
        sql<number>`coalesce(sum(case when "postType" = 'matter' then 1 else 0 end), 0)`.as(
          'matterPosts',
        ),
      )
      .executeTakeFirst(),
    db.db
      .selectFrom('para_status')
      .where(
        sql`regexp_replace(lower(coalesce("party", '')), '[^a-z0-9]+', '', 'g')`,
        '!=',
        '',
      )
      .where(
        sql`regexp_replace(lower(coalesce("community", '')), '[^a-z0-9]+', '-', 'g')`,
        '=',
        community,
      )
      .select(countAll.as('count'))
      .executeTakeFirst(),
  ])

  return {
    members: Number(members?.count ?? 0),
    visiblePosters: Number(posters?.count ?? 0),
    policyPosts:
      Number(posts?.policyPosts ?? 0) + Number(postMeta?.policyPosts ?? 0),
    matterPosts:
      Number(posts?.matterPosts ?? 0) + Number(postMeta?.matterPosts ?? 0),
    badgeHolders: Number(badges?.count ?? 0),
  }
}

/** Office and membership holders of an OD-9 account, from its folded chain. */
const accountRoleHolders = async (db: Database, communityDid: string) => {
  const rows = await db.db
    .selectFrom('para_community_member_state as member')
    .leftJoin('para_community_chain_event as event', (join) =>
      join
        .onRef('event.community', '=', 'member.community')
        .onRef('event.seq', '=', 'member.since'),
    )
    .where('member.community', '=', communityDid)
    .select([
      'member.did',
      'member.status',
      'member.offices',
      'member.suspendedUntil',
      'member.since',
      'member.joinedAt',
      'event.uri as eventUri',
      'event.createdAt as eventAt',
    ])
    .orderBy('member.did')
    .execute()
  const now = Date.now()
  return rows.flatMap((row) => {
    const effective = effectiveCommunityMember(
      {
        status: row.status as CommunityMember['status'],
        offices: row.offices as CommunityOffice[],
        ...(row.suspendedUntil ? { suspendedUntil: row.suspendedUntil } : {}),
        since: row.since,
      },
      now,
    )
    if (effective?.status !== 'active') return []
    return ['member', ...effective.offices].map(
      (role) =>
        new ParaRoleHolder({
          did: row.did,
          role,
          effectiveAt:
            role === 'member'
              ? (row.joinedAt ?? row.eventAt ?? '')
              : (row.eventAt ?? ''),
          expiresAt: '',
          evidence: row.eventUri ?? '',
        }),
    )
  })
}

/** Owners and moderators of an OD-9 account, as the governance view lists them. */
const accountModerators = async (db: Database, communityDid: string) => {
  const holders = await Promise.all(
    (['owner', 'moderator'] as const).map(async (office) => ({
      office,
      dids: await accountOfficeHolders(db, communityDid, office),
    })),
  )
  const dids = holders.flatMap((holder) => holder.dids)
  const people =
    dids.length === 0
      ? []
      : await db.db
          .selectFrom('actor')
          .leftJoin('profile', 'profile.creator', 'actor.did')
          .where('actor.did', 'in', dids)
          .select(['actor.did', 'actor.handle', 'profile.displayName'])
          .execute()
  const byDid = new Map(people.map((person) => [person.did, person]))
  return holders.flatMap(({ office, dids }) =>
    dids.map(
      (did) =>
        new ParaCommunityModerator({
          member: toGovernanceMember({
            did,
            handle: byDid.get(did)?.handle ?? undefined,
            displayName: byDid.get(did)?.displayName ?? undefined,
          }),
          role: office,
          badge: office,
        }),
    ),
  )
}

const toGovernanceMember = (person: {
  did?: string
  handle?: string
  displayName?: string
  avatar?: string
}) =>
  new ParaCommunityMember({
    did: person.did ?? '',
    handle: person.handle ?? undefined,
    displayName: person.displayName ?? undefined,
    avatar: person.avatar ?? undefined,
  })

const getPublishedGovernanceRecord = async (
  db: Database,
  board: GovernanceBoard,
): Promise<GovernanceRecord | null> => {
  // @NOTE an OD-9 account lists its officers from its chain (OD-9 §3.8);
  // it has no founder-written governance record.
  if (communityAccountDid(board.uri)) return null
  const json = await getTrustedGovernanceRecordJson(db, board)
  return json ? parseGovernanceRecord(json) : null
}

const parseGovernanceRecord = (json: string): GovernanceRecord | null => {
  try {
    const parsed = JSON.parse(json)
    const validated = com.para.community.governance.$safeValidate(parsed)
    if (validated.success) return validated.value as GovernanceRecord
    if (
      typeof parsed?.community === 'string' &&
      typeof parsed?.slug === 'string' &&
      Array.isArray(parsed?.moderators) &&
      Array.isArray(parsed?.officials) &&
      Array.isArray(parsed?.deputies)
    ) {
      return parsed as GovernanceRecord
    }
    return null
  } catch {
    return null
  }
}

const normalizeCommunitySlug = (value?: string | null) =>
  (value || '')
    .trim()
    .replace(/^p\//i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const paraCommunityMetaMatches = (
  value: string,
  board?: Pick<BoardRow, 'name' | 'slug'>,
) => {
  const exactCandidates = paraCommunityMetaCandidates(value, board)
  const normalizedCandidates = [
    ...new Set(exactCandidates.map(normalizeCommunitySlug).filter(Boolean)),
  ]
  const normalizedPrefix = normalizeCommunitySlug(value)

  if (normalizedCandidates.length < 1) {
    return sql<boolean>`(
      lower(coalesce("para_post"."community", '')) in (${sql.join(exactCandidates)})
      or exists (
        select 1
        from "para_post_meta"
        where "para_post_meta"."postUri" = "para_post"."uri"
          and lower(coalesce("para_post_meta"."community", '')) in (${sql.join(exactCandidates)})
      )
    )`
  }

  return sql<boolean>`(
    lower(coalesce("para_post"."community", '')) in (${sql.join(exactCandidates)})
    or regexp_replace(lower(coalesce("para_post"."community", '')), '[^a-z0-9]+', '-', 'g') in (${sql.join(normalizedCandidates)})
    or regexp_replace(lower(coalesce("para_post"."community", '')), '[^a-z0-9]+', '-', 'g') like ${`${normalizedPrefix}-%`}
    or exists (
      select 1
      from "para_post_meta"
      where "para_post_meta"."postUri" = "para_post"."uri"
        and (
          lower(coalesce("para_post_meta"."community", '')) in (${sql.join(exactCandidates)})
          or regexp_replace(lower(coalesce("para_post_meta"."community", '')), '[^a-z0-9]+', '-', 'g') in (${sql.join(normalizedCandidates)})
          or regexp_replace(lower(coalesce("para_post_meta"."community", '')), '[^a-z0-9]+', '-', 'g') like ${`${normalizedPrefix}-%`}
        )
    )
  )`
}

const paraCommunityMetaCandidates = (
  value: string,
  board?: Pick<BoardRow, 'name' | 'slug'>,
) => {
  const values = [
    value,
    normalizeCommunitySlug(value),
    board?.slug,
    board?.name,
    board?.slug ? normalizeCommunitySlug(board.slug) : undefined,
    board?.name ? normalizeCommunitySlug(board.name) : undefined,
  ]
  const candidates = new Set<string>()

  for (const candidate of values) {
    const raw = candidate?.trim().toLowerCase()
    if (!raw) continue
    const withoutPrefix = raw.replace(/^p\//, '')
    candidates.add(raw)
    candidates.add(withoutPrefix)
    candidates.add(`p/${withoutPrefix}`)
  }

  return [...candidates]
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
