import type { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import type { Service } from '../../../proto/bsky_connect.js'
import {
  GetParaCommunityBriefingPackResponse,
  GetParaCommunityBriefingPacksResponse,
  ParaCommunityBriefingPackView,
} from '../../../proto/bsky_pb.js'
import { accountBriefingStates } from '../community-content.js'
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
      .where(publishedBySteward())

    if (communityUri) {
      builder = builder.where('bp.communityUri', '=', communityUri)
    }

    if (status) {
      // A pack has the status the chain gave it.
      builder = builder.where(publishedBySteward(status))
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
    const page = await trustedBriefingPacks(db, raw)

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

    const [trusted] = row ? await trustedBriefingPacks(db, [row]) : []
    if (!trusted) return new GetParaCommunityBriefingPackResponse()

    return new GetParaCommunityBriefingPackResponse({
      briefingPack: toProtoView(trusted),
    })
  },
})

/**
 * Packs are drafted by members and published by a steward's chain event,
 * which names the version (OD-9 §3.9). An edit changes the CID and withdraws
 * the pack until it is published again. A pack in anything but a community
 * account has no state, so it is not served.
 */
const trustedBriefingPacks = async <
  T extends {
    uri: string
    cid: string
    communityUri: string
    status: string
  },
>(
  db: Database,
  rows: readonly T[],
): Promise<T[]> => {
  const states = await accountBriefingStates(db, rows)
  return rows.flatMap((row) => {
    const state = states.get(row.uri)
    return state ? [{ ...row, status: state }] : []
  })
}

const publishedBySteward = (state?: string) => sql<boolean>`exists (
  select 1 from para_community_briefing_state chain
  where chain.target = "bp".uri and chain.cid = "bp".cid
    and "bp"."communityUri" = 'at://' || chain.community || '/com.para.community.profile/self'
    ${state ? sql`and chain.state = ${state}` : sql``}
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
