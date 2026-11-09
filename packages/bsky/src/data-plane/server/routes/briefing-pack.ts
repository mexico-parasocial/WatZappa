import type { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import type { Service } from '../../../proto/bsky_connect.js'
import {
  GetParaCommunityBriefingPackResponse,
  GetParaCommunityBriefingPacksResponse,
  ParaCommunityBriefingPackView,
} from '../../../proto/bsky_pb.js'
import { filterByOfficeWhenIndexed } from '../community-authority.js'
import type { Database } from '../db/index.js'
import { CreatedAtCidKeyset, paginate } from '../db/pagination.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaCommunityBriefingPacks(req) {
    const {
      communityUri,
      viewerDid: _viewerDid,
      limit,
      cursor,
      query,
      status,
    } = req
    const { ref } = db.db.dynamic

    const pageLimit = normalizeLimit(limit)
    const keyset = new CreatedAtCidKeyset(ref('bp.createdAt'), ref('bp.cid'))

    let builder = db.db
      .selectFrom('para_community_briefing_pack as bp')
      .leftJoin('actor', 'actor.did', 'bp.creator')
      .selectAll('bp')
      .select('actor.handle as creatorHandle')
      .where(briefingAuthorCandidateSql)

    if (communityUri) {
      builder = builder.where('bp.communityUri', '=', communityUri)
    }

    if (status) {
      builder = builder.where('bp.status', '=', status)
    }

    if (query) {
      const like = `%${query.replace(/[%_]/g, '\\$&')}%`
      builder = builder.where(
        sql<boolean>`(
          "bp"."title" ilike ${like}
          or "bp"."summary" ilike ${like}
          or "bp"."party" ilike ${like}
        )`,
      )
    }

    builder = paginate(builder, {
      limit: pageLimit + 1,
      cursor,
      keyset,
      tryIndex: true,
    })

    const rows = await builder.execute()
    const raw = rows.slice(0, pageLimit)
    const hasMore = rows.length > pageLimit
    // The SQL filter is only a necessary condition; the page can come back
    // short, but the cursor still follows the rows that were read.
    const page = await filterTrustedBriefingPacks(db, raw)

    return new GetParaCommunityBriefingPacksResponse({
      briefingPacks: page.map((row) => toProtoView(row)),
      cursor: hasMore ? (keyset.packFromResult(raw) ?? '') : '',
    })
  },

  async getParaCommunityBriefingPack(req) {
    const { uri } = req
    if (!uri) {
      return new GetParaCommunityBriefingPackResponse()
    }

    const row = await db.db
      .selectFrom('para_community_briefing_pack as bp')
      .leftJoin('actor', 'actor.did', 'bp.creator')
      .selectAll('bp')
      .select('actor.handle as creatorHandle')
      .where('bp.uri', '=', uri)
      .executeTakeFirst()

    if (!row || (await filterTrustedBriefingPacks(db, [row])).length === 0) {
      return new GetParaCommunityBriefingPackResponse()
    }

    return new GetParaCommunityBriefingPackResponse({
      briefingPack: toProtoView(row),
    })
  },
})

/**
 * A briefing pack lives in its author's repo, and anyone can write one naming
 * any community. Managing briefing packs is a moderator capability
 * (`briefing.manage`), so a pack counts only if its author was an owner or
 * moderator of its community when the AppView indexed it. An edit re-indexes
 * the pack, so authority is judged again at each edit.
 */
const filterTrustedBriefingPacks = <
  T extends { communityUri: string; creator: string; indexedAt: string },
>(
  db: Database,
  rows: readonly T[],
) =>
  filterByOfficeWhenIndexed(
    db,
    rows,
    (row) => ({
      community: row.communityUri,
      author: row.creator,
      indexedAt: row.indexedAt,
    }),
    ['owner', 'moderator'],
  )

/** Necessary condition for `filterTrustedBriefingPacks`, cheap enough for SQL. */
const briefingAuthorCandidateSql = sql<boolean>`exists (
  select 1 from para_community_authority_event grant_event
  where grant_event."communityUri" = "bp"."communityUri"
    and grant_event.subject = "bp".creator
    and grant_event.action in ('owner.grant', 'moderator.grant')
)`

type BriefingPackRow = {
  uri: string
  cid: string
  creator: string
  communityUri: string
  title: string
  summary: string | null
  status: string
  createdAt: string
  updatedAt: string
  indexedAt: string
  creatorHandle?: string | null
}

const toProtoView = (row: BriefingPackRow): ParaCommunityBriefingPackView =>
  new ParaCommunityBriefingPackView({
    uri: row.uri,
    cid: row.cid,
    communityUri: row.communityUri,
    title: row.title,
    description: row.summary ?? '',
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.creator,
    createdByHandle: row.creatorHandle ?? '',
  })

const normalizeLimit = (limit: number | undefined) => {
  if (!limit || Number.isNaN(limit)) return 50
  return Math.max(1, Math.min(limit, 100))
}
