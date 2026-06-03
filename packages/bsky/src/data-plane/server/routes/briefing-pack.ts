import { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import { Service } from '../../../proto/bsky_connect.js'
import {
  GetParaCommunityBriefingPackResponse,
  GetParaCommunityBriefingPacksResponse,
  ParaCommunityBriefingPackView,
} from '../../../proto/bsky_pb.js'
import { Database } from '../db/index.js'
import { CreatedAtCidKeyset, paginate } from '../db/pagination.js'

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaCommunityBriefingPacks(req) {
    const { communityUri, viewerDid: _viewerDid, limit, cursor, query, status } = req
    const { ref } = db.db.dynamic

    const pageLimit = normalizeLimit(limit)
    const keyset = new CreatedAtCidKeyset(
      ref('bp.createdAt'),
      ref('bp.cid'),
    )

    let builder = db.db
      .selectFrom('para_community_briefing_pack as bp')
      .leftJoin('actor', 'actor.did', 'bp.creator')
      .selectAll('bp')
      .select('actor.handle as creatorHandle')

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
    const page = rows.slice(0, pageLimit)
    const hasMore = rows.length > pageLimit

    return new GetParaCommunityBriefingPacksResponse({
      briefingPacks: page.map((row) => toProtoView(row)),
      cursor: hasMore ? keyset.packFromResult(page) ?? '' : '',
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

    if (!row) {
      return new GetParaCommunityBriefingPackResponse()
    }

    return new GetParaCommunityBriefingPackResponse({
      briefingPack: toProtoView(row),
    })
  },
})

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
