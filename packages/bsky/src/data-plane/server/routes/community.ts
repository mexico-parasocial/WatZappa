import { Code, ConnectError, ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import * as ComParaCommunityGovernance from '../../../lexicon/types/com/para/community/governance.js'
import { Service } from '../../../proto/bsky_connect.js'
import {
  GetParaCommunityBoardResponse,
  GetParaCommunityBoardsResponse,
  GetParaCommunityGovernanceResponse,
  GetParaCommunityMembersResponse,
  GetParaCommunityPostsResponse,
  GetParaCommunityRelationsResponse,
  GetParaCommunitySharedContentResponse,
  ParaAuthorFeedItem,
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
  ParaSharedContentActionView,
  ParaStrongRef,
} from '../../../proto/bsky_pb.js'
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
}

type MembershipRow = {
  communityUri: string
  creator?: string
  membershipState: string
  roles: string[] | null
  roleAssignments: Record<string, unknown>[] | null
  joinedAt?: string
}

type GovernanceRecord = ComParaCommunityGovernance.Record

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
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
        getGovernanceSummary(db, board.name, board.slug).catch(() => null),
        getChildCommunityCounts(db, [board.uri]),
        getSharedContentCounts(db, [board.uri]),
        getParentCommunityUris(db, [board.uri]),
      ])

      return new GetParaCommunityBoardResponse({
        board: toBoardView(board, memberCount, viewerMembership, {
          childCommunityCount: childCounts.get(board.uri) ?? 0,
          sharedContentCount: sharedCounts.get(board.uri) ?? 0,
          parentCommunityUris: parentUris.get(board.uri) ?? [],
        }),
        governanceSummary: governanceSummary ?? undefined,
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

  async getParaCommunityGovernance(req) {
    const community = normalizeCommunitySlug(req.community)
    const [record, counters] = await Promise.all([
      getPublishedGovernanceRecord(db, req.community, community),
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

    return new GetParaCommunityGovernanceResponse({
      community,
      summary: new ParaCommunitySummary(counters),
      moderators:
        record?.moderators
          .filter(isValidGovernanceEntry)
          .map(
            (moderator) =>
              new ParaCommunityModerator({
                member: toGovernanceMember(moderator),
                role: moderator.role,
                badge: moderator.badge,
              }),
          ) ?? [],
      officials:
        record?.officials
          .filter(isValidGovernanceEntry)
          .map(
            (official) =>
              new ParaCommunityOfficial({
                member: toGovernanceMember(official),
                office: official.office,
                mandate: official.mandate,
              }),
          ) ?? [],
      deputies:
        record?.deputies
          .filter(isValidGovernanceEntry)
          .map(
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
    const actionMap = await getLatestSharedContentActions(
      db,
      rows.map((row) => row.uri),
    )

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
      cursor: hasMore ? keyset.packFromResult(page) ?? '' : '',
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
    const page = rows.slice(0, normalizeLimit(req.limit))

    return new GetParaCommunityRelationsResponse({
      relations: page.map((row) => toRelationView(row)),
      cursor:
        rows.length > page.length ? keyset.packFromResult(page) ?? '' : '',
    })
  },
})

const selectBoard = async (
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
  },
): Promise<{ boards: BoardRow[]; cursor: string }> => {
  let builder = boardBaseQuery(db)

  if (opts.quadrant) {
    builder = builder.where('board.quadrant', '=', opts.quadrant)
  }

  const state = opts.state?.trim()
  if (state) {
    builder = builder.where('gov.state', '=', state)
  }

  const flairId = opts.flairId?.trim()
  if (flairId) {
    if (opts.participationKind === 'matter') {
      builder = builder.where(sql`gov."matterFlairIds" ? ${flairId}`)
    } else if (opts.participationKind === 'policy') {
      builder = builder.where(sql`gov."policyFlairIds" ? ${flairId}`)
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
    cursor: hasMore ? keyset.packFromResult(page) ?? '' : '',
  }
}

const boardBaseQuery = (db: Database) =>
  db.db
    .selectFrom('para_community_board as board')
    .leftJoin('actor as actor', 'actor.did', 'board.creator')
    .leftJoin(
      'para_community_governance as gov',
      'gov.communityUri',
      'board.uri',
    )
    .select([
      'board.uri',
      'board.cid',
      'board.creator',
      'board.slug',
      'board.name',
      'board.description',
      'board.quadrant',
      'board.delegatesChatId',
      'board.subdelegatesChatId',
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

const getMemberCounts = async (db: Database, communityUris: string[]) => {
  if (communityUris.length === 0) {
    return new Map<string, number>()
  }

  const rows = await db.db
    .selectFrom('para_community_membership')
    .where('communityUri', 'in', communityUris)
    .where('membershipState', '=', 'active')
    .select(['communityUri', sql<number>`count(*)`.as('memberCount')])
    .groupBy('communityUri')
    .execute()

  return new Map(
    rows.map((row) => [row.communityUri, Number(row.memberCount) || 0]),
  )
}

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

  const rows = await db.db
    .selectFrom('para_community_relation')
    .where('parentCommunityUri', 'in', communityUris)
    .where('relation', '=', 'parentChild')
    .select(['parentCommunityUri', sql<number>`count(*)`.as('childCount')])
    .groupBy('parentCommunityUri')
    .execute()

  return new Map(
    rows.map((row) => [row.parentCommunityUri, Number(row.childCount) || 0]),
  )
}

const getParentCommunityUris = async (
  db: Database,
  communityUris: string[],
) => {
  if (communityUris.length === 0) {
    return new Map<string, string[]>()
  }

  const rows = await db.db
    .selectFrom('para_community_relation')
    .where('childCommunityUri', 'in', communityUris)
    .where('relation', '=', 'parentChild')
    .select(['childCommunityUri', 'parentCommunityUri'])
    .execute()

  const result = new Map<string, string[]>()
  for (const row of rows) {
    const existing = result.get(row.childCommunityUri) ?? []
    existing.push(row.parentCommunityUri)
    result.set(row.childCommunityUri, existing)
  }
  return result
}

const getCommunityAndChildren = async (
  db: Database,
  communityUri: string,
): Promise<string[]> => {
  if (!communityUri) return []
  const rows = await db.db
    .selectFrom('para_community_relation')
    .where('parentCommunityUri', '=', communityUri)
    .where('relation', '=', 'parentChild')
    .select('childCommunityUri')
    .execute()

  return [communityUri, ...rows.map((row) => row.childCommunityUri)]
}

const getLatestSharedContentActions = async (
  db: Database,
  sharedContentUris: string[],
) => {
  if (sharedContentUris.length === 0) {
    return new Map<string, any>()
  }

  const rows = await db.db
    .selectFrom('para_community_shared_content_action')
    .where('sharedContentUri', 'in', sharedContentUris)
    .selectAll()
    .orderBy('createdAt', 'desc')
    .orderBy('cid', 'desc')
    .execute()

  const result = new Map<string, any>()
  for (const row of rows) {
    if (!result.has(row.sharedContentUri)) {
      result.set(row.sharedContentUri, row)
    }
  }
  return result
}

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
    removedAt: removed ? action?.createdAt ?? '' : '',
    removedBy: removed ? action?.creator ?? '' : '',
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

  const rows = await db.db
    .selectFrom('para_community_membership')
    .where('creator', '=', viewerDid)
    .where('communityUri', 'in', communityUris)
    .select([
      'communityUri',
      'creator',
      'membershipState',
      'roles',
      'roleAssignments',
      'joinedAt',
    ])
    .execute()

  return new Map(
    rows.map((row) => [
      row.communityUri,
      {
        ...row,
        roles: filterValidRoles(row.roles, row.roleAssignments),
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

  const membership = await db.db
    .selectFrom('para_community_membership')
    .where('creator', '=', opts.viewerDid)
    .where('communityUri', '=', opts.communityUri)
    .where('membershipState', '=', 'active')
    .select(['roles', 'roleAssignments'])
    .executeTakeFirst()

  const roles = filterValidRoles(
    membership?.roles ?? null,
    membership?.roleAssignments ?? null,
  )
  const isSteward = roles.some((role) =>
    ['owner', 'moderator', 'steward', 'official'].includes(role),
  )
  if (!isSteward) {
    throw new ConnectError(
      'Community steward role is required',
      Code.PermissionDenied,
    )
  }
}

const filterValidRoles = (
  roles: string[] | null,
  roleAssignments: Record<string, unknown>[] | null,
): string[] => {
  if (roleAssignments && roleAssignments.length > 0) {
    const now = Date.now()
    return roleAssignments
      .filter((assignment) => {
        const validFrom = assignment.validFrom
          ? Date.parse(assignment.validFrom as string)
          : 0
        const validUntil = assignment.validUntil
          ? Date.parse(assignment.validUntil as string)
          : Infinity
        if (validFrom > now) return false
        if (validUntil <= now) return false
        return true
      })
      .map((assignment) => (assignment.role as string) || '')
      .filter(Boolean)
  }
  return roles ?? []
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
      'membership.roles',
      'membership.roleAssignments',
      'membership.joinedAt',
      'actor.handle as handle',
      'profile.displayName as displayName',
    ])

  const role = opts.role?.trim()
  if (role) {
    builder = builder.where(
      sql<boolean>`${role} = any(coalesce("membership"."roles", array[]::text[]))`,
    )
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
    const [voteCounts, delegationCounts, postCounts] = await Promise.all([
      getVoteCounts(db, dids),
      getDelegationCounts(db, dids),
      getCommunityPostCounts(db, dids, communityUri),
    ])

    return {
      members: page.map((row) => {
        const postCount = postCounts.get(row.did)
        return {
          did: row.did,
          handle: row.handle ?? '',
          displayName: row.displayName ?? '',
          avatar: '',
          membershipState: row.membershipState,
          roles: filterValidRoles(row.roles ?? null, row.roleAssignments ?? null),
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
  const [voteCounts, delegationCounts, postCounts] = await Promise.all([
    getVoteCounts(db, dids),
    getDelegationCounts(db, dids),
    getCommunityPostCounts(db, dids, communityUri),
  ])

  return {
    members: page.map((row) => {
      const postCount = postCounts.get(row.did)
      return {
        did: row.did,
        handle: row.handle ?? '',
        displayName: row.displayName ?? '',
        avatar: '',
        membershipState: row.membershipState,
        roles: filterValidRoles(row.roles ?? null, row.roleAssignments ?? null),
        joinedAt: row.joinedAt,
        votesCast: voteCounts.get(row.did) ?? 0,
        delegationsReceived: delegationCounts.get(row.did) ?? 0,
        policyPosts: postCount?.policyPosts ?? 0,
        matterPosts: postCount?.matterPosts ?? 0,
      }
    }),
    cursor: rows.length > opts.limit ? keyset.packFromResult(page) ?? '' : '',
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

  const board = await db.db
    .selectFrom('para_community_board')
    .where('uri', '=', communityUri)
    .select(['name', 'slug'])
    .executeTakeFirst()

  const community = board
    ? normalizeCommunitySlug(board.slug || board.name)
    : ''
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
  community: string,
  slug: string,
): Promise<ParaCommunityGovernanceSummary | null> => {
  const record = await getPublishedGovernanceRecord(db, community, slug)
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

const COMMUNITY_TRANSLATION_SOURCE =
  'ÁÀÄÂÃáàäâãÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç'
const COMMUNITY_TRANSLATION_TARGET =
  'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'

const getPublishedGovernanceRecord = async (
  db: Database,
  community: string,
  slug: string,
): Promise<GovernanceRecord | null> => {
  const suffix = `/com.para.community.governance/${slug || 'community'}`

  const slugMatch = await db.db
    .selectFrom('record')
    .select(['json'])
    .where('uri', 'like', `%${suffix}`)
    .orderBy('indexedAt', 'desc')
    .executeTakeFirst()
  if (slugMatch) {
    return parseGovernanceRecord(slugMatch.json)
  }

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

  return recordMatch ? parseGovernanceRecord(recordMatch.json) : null
}

const parseGovernanceRecord = (json: string): GovernanceRecord | null => {
  try {
    const parsed = JSON.parse(json)
    const validated = ComParaCommunityGovernance.validateRecord(parsed)
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

const normalizeCommunityKey = (value?: string | null) =>
  (value || '')
    .trim()
    .replace(/^p\//i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

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
