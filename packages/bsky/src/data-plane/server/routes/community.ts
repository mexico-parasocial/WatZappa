import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import {
  AUTHORITY_EVENT_VERSION,
  type CommunityMember,
  type CommunityOffice,
  effectiveCommunityMember,
  getRoleDefinitions,
  resolveAvailableAction,
} from '@atproto/common'
import type { Service } from '../../../proto/bsky_connect.js'
import {
  GetParaCommunityAuthorizationResponse,
  GetParaCommunityBoardResponse,
  GetParaCommunityBoardsResponse,
  GetParaCommunityGovernanceResponse,
  GetParaCommunityMembersResponse,
  GetParaCommunityPostsResponse,
  GetParaCommunityRelationsResponse,
  GetParaCommunitySharedContentResponse,
  GetParaPolicyCommunityVotesResponse,
  ParaAuthorFeedItem,
  ParaAvailableAction,
  ParaCommunityBoardView,
  ParaCommunityGovernanceSummary,
  ParaCommunityMember,
  ParaCommunityMemberView,
  ParaCommunityModerator,
  ParaCommunityRelationView,
  ParaCommunitySharedContentView,
  ParaCommunitySummary,
  ParaJsonPageResponse,
  ParaPolicyCommunityVote,
  ParaPolicySignalBucket,
  ParaRoleDefinition,
  ParaRoleHolder,
  ParaStrongRef,
} from '../../../proto/bsky_pb.js'
import {
  getAuthoritySnapshot,
  getAuthoritySnapshots,
} from '../community-authority.js'
import {
  type AccountShareOverlay,
  accountOpenOffers,
  accountRelationRows,
  accountShareOverlays,
  countAccountShares,
} from '../community-content.js'
import {
  accountOfficeHolders,
  activeMemberDids,
  communityAccountDid,
  countActiveMembers,
  effectivelyActiveSql,
  resolveCommunityAccountUris,
} from '../community-membership.js'
import type { Database } from '../db/index.js'
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

type GovernanceBoard = {
  uri: string
  creator: string
  name: string | null
  slug: string | null
}

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
    const authorization = resolveAvailableAction(req.action, snapshot.roles)
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
                  resolveAvailableAction(action, snapshot.roles),
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
      .where('vote.signal', '!=', 0) // OD-10 §7.5: neutral is not a ballot

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
    const counters = await getCommunityCounters(db, community)

    const computedAt = new Date().toISOString()
    const admissionMode = (board?.admissionMode || 'open') as
      'open' | 'assembly_approval'
    const roleHolders: ParaRoleHolder[] = []
    if (accountDid)
      roleHolders.push(...(await accountRoleHolders(db, accountDid)))

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
      moderators: accountDid ? await accountModerators(db, accountDid) : [],
      // @NOTE an account lists its officers from its chain (OD-9 §3.8); it
      // has no officials, deputies or published governance record.
      officials: [],
      deputies: [],
      computedAt,
      editHistory: [],
      admissionMode,
      authorityEventVersion: AUTHORITY_EVENT_VERSION,
      roleDefinitions: getRoleDefinitions(admissionMode).map(
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
    const overlays = await accountShareOverlays(db, rows)

    // A share in a community counts while its author is still a member, and
    // only a steward's chain event hides it. Any other share names no
    // community, so it is not served.
    const visible = rows.filter((row) => {
      const overlay = overlays.get(row.uri)
      return (
        overlay && overlay.counts && (req.includeRemoved || !overlay.hidden)
      )
    })
    const page = visible.slice(0, normalizeLimit(req.limit))
    const hasMore = visible.length > page.length || rows.length > page.length

    return new GetParaCommunitySharedContentResponse({
      items: page.map((row) =>
        toSharedContentView(row, req.communityUri, overlays.get(row.uri)),
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
    const limit = normalizeLimit(req.limit)

    const filtered = <T extends { where: any }>(builder: T): T => {
      let out: any = builder
      if (req.communityUri) {
        out = out.where(
          sql<boolean>`(
            "relation"."parentCommunityUri" = ${req.communityUri}
            or "relation"."childCommunityUri" = ${req.communityUri}
          )`,
        )
      }
      if (req.parentCommunityUri) {
        out = out.where(
          'relation.parentCommunityUri',
          '=',
          req.parentCommunityUri,
        )
      }
      if (req.childCommunityUri) {
        out = out.where(
          'relation.childCommunityUri',
          '=',
          req.childCommunityUri,
        )
      }
      if (req.relation) {
        out = out.where('relation.relation', '=', req.relation)
      }
      return paginate(out, {
        limit: limit + 1,
        cursor: req.cursor,
        keyset,
        tryIndex: true,
      })
    }

    // A relation joins two community accounts through the halves in their own
    // chains, so the fold has verified it already. Only `parentChild` exists.
    if (req.relation && req.relation !== 'parentChild') {
      return new GetParaCommunityRelationsResponse({
        relations: [],
        cursor: '',
      })
    }
    const rows: any[] = await filtered(
      db.db.selectFrom(accountRelationRows(db).as('relation')).selectAll(),
    ).execute()
    const page = rows.slice(0, limit)

    return new GetParaCommunityRelationsResponse({
      relations: page.map((row) => toRelationView(row)),
      cursor:
        rows.length > page.length
          ? (keyset.packFromResult(page as any) ?? '')
          : '',
    })
  },

  async getParaCommunityOpenOffers(req) {
    if (!req.community) {
      throw new ConnectError('community is required', Code.InvalidArgument)
    }
    const { offers, cursor } = await accountOpenOffers(
      db,
      req.community,
      req.viewerDid,
      normalizeLimit(req.limit),
      req.cursor,
    )
    return new ParaJsonPageResponse({
      itemsJson: JSON.stringify(offers),
      cursor,
    })
  },
})

const selectBoard = async (
  db: Database,
  communityId?: string,
  uri?: string,
): Promise<BoardRow | undefined> => {
  return selectCommunityAccount(db, uri || communityId)
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
    admissionMode: row.admissionMode ?? 'open',
  }
}

const selectBoardPostIdentity = async (
  db: Database,
  communityId?: string,
): Promise<Pick<BoardRow, 'name' | 'slug'> | undefined> => {
  if (!communityId) return undefined
  const account = await selectCommunityAccount(db, communityId)
  return account ? { name: account.name, slug: account.slug } : undefined
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
  let builder = listedBoardsQuery(db)

  if (opts.quadrant) {
    builder = builder.where('board.quadrant', '=', opts.quadrant)
  }

  const region = opts.region?.trim()
  if (region) {
    builder = builder.where('board.region', '=', region)
  }

  const state = opts.state?.trim()
  if (state) {
    builder = builder.where('board.state', '=', state)
  }

  const flairId = opts.flairId?.trim()
  if (flairId) {
    if (opts.participationKind === 'matter') {
      builder = builder.where(sql<boolean>`board."matterFlairIds" ? ${flairId}`)
    } else if (opts.participationKind === 'policy') {
      builder = builder.where(sql<boolean>`board."policyFlairIds" ? ${flairId}`)
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
      sql`(
        select count(*) from para_community_member_state as ms
        where ms.community = board.did and ${effectivelyActiveSql('ms')}
      )`,
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

/**
 * Community accounts as a list of board-shaped rows (see
 * `selectCommunityAccount`). A founded account is listed even while frozen,
 * with the state `frozen`.
 */
const listedBoardsQuery = (db: Database) => {
  const accounts = db.db
    .selectFrom('para_community_account as account')
    .leftJoin('actor as actor', 'actor.did', 'account.did')
    .leftJoin('para_community_chain_event as founding', (join) =>
      join
        .onRef('founding.community', '=', 'account.did')
        .on('founding.seq', '=', 1)
        .on('founding.status', '=', 'applied'),
    )
    .leftJoin('actor as founder', 'founder.did', 'founding.actor')
    .where('account.governanceMode', 'is not', null)
    .select([
      sql<string>`'at://' || account.did || '/com.para.community.profile/self'`.as(
        'uri',
      ),
      sql<string>`coalesce(account."profileCid", '')`.as('cid'),
      sql<string>`coalesce(founding.actor, account.did)`.as('creator'),
      sql<string>`coalesce(split_part(actor.handle, '.', 1), '')`.as('slug'),
      sql<string>`coalesce(account.name, split_part(actor.handle, '.', 1), '')`.as(
        'name',
      ),
      'account.description',
      sql<string>`coalesce(account.quadrant, '')`.as('quadrant'),
      'account.region',
      sql<string>`''`.as('delegatesChatId'),
      sql<string>`''`.as('subdelegatesChatId'),
      sql<string>`coalesce(account."admissionMode", 'open')`.as(
        'admissionMode',
      ),
      sql<string>`coalesce(account."createdAt", account."indexedAt")`.as(
        'createdAt',
      ),
      'account.indexedAt',
      sql<string>`case when account.broken is not null then 'frozen' else 'active' end`.as(
        'state',
      ),
      sql<string[] | null>`null::jsonb`.as('matterFlairIds'),
      sql<string[] | null>`null::jsonb`.as('policyFlairIds'),
      sql<number>`(
        select count(*)::integer from para_community_member_state as moderator
        where moderator.community = account.did
          and moderator.offices ? 'moderator'
          and ${effectivelyActiveSql('moderator')}
      )`.as('moderatorCount'),
      sql<number>`0`.as('officialCount'),
      sql<number>`0`.as('deputyRoleCount'),
      sql<string | null>`null::varchar`.as('lastPublishedAt'),
      'founder.handle as creatorHandle',
      sql<string | null>`null::varchar`.as('creatorDisplayName'),
      'account.did as did',
    ])
  return db.db.selectFrom(accounts.as('board')).selectAll('board')
}

const getMemberCounts = (db: Database, communityUris: string[]) =>
  countActiveMembers(db, communityUris)

const getSharedContentCounts = async (
  db: Database,
  communityUris: string[],
) => {
  if (communityUris.length === 0) {
    return new Map<string, number>()
  }

  return countAccountShares(db, communityUris)
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

/** `parentChild` relations whose `side` is one of `uris`. */
const selectParentChildRelations = async (
  db: Database,
  side: 'parentCommunityUri' | 'childCommunityUri',
  uris: string[],
) => {
  const accountUris = uris.filter((uri) => communityAccountDid(uri))
  if (accountUris.length === 0) return []
  return db.db
    .selectFrom(accountRelationRows(db).as('relation'))
    .where(`relation.${side}`, 'in', accountUris)
    .select([
      'relation.parentCommunityUri',
      'relation.childCommunityUri',
      'relation.creator',
      'relation.indexedAt',
    ])
    .execute()
}

const toSharedContentView = (
  row: any,
  requestedCommunityUri: string,
  overlay?: AccountShareOverlay,
) => {
  const removed = overlay?.hidden ?? false
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
    // A community is pinned by its stewards, never by the sharer.
    pinned: overlay?.pinned ?? false,
    sortRank: row.sortRank ?? 0,
    createdAt: row.createdAt,
    removed,
    removedAt: removed ? (overlay?.hiddenAt ?? '') : '',
    removedBy: removed ? (overlay?.hiddenBy ?? '') : '',
    hydrationState: 'unresolved',
  })
}

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
  return selectAccountMembers(db, communityUri, opts)
}

/**
 * Members of an OD-9 account, from its folded chain. States are as of now: a
 * suspension whose end has passed lists as active.
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
  } else if (
    requestedState === 'left' ||
    requestedState === 'removed' ||
    requestedState === 'blocked'
  ) {
    builder = builder.where('member.status', '=', requestedState)
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
        .executeTakeFirst()
    : undefined

  const community = board ? normalizeCommunitySlug(board.slug) : ''
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
  // A community's summary is its folded chain's (see selectCommunityAccount).
  if (!communityAccountDid(board.uri)) return null
  return new ParaCommunityGovernanceSummary({
    moderatorCount: board.moderatorCount ?? 0,
    officialCount: 0,
    deputyRoleCount: 0,
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
