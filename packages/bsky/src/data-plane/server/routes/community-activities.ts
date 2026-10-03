import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import type { Service } from '../../../proto/bsky_connect.js'
import { getAuthoritySnapshot } from '../community-authority.js'
import type { Database } from '../db/index.js'

/*
 * Community activities, their ledgers and wiki pages live in their authors'
 * repos, so anyone can write a record that names any community. Only records
 * by the community's current organizers are served: the board's creator, or
 * an owner or moderator by the verified authority events. Two weaker sources
 * are deliberately not used: the governance record (any account can publish
 * one under any community's slug) and the roles in a legacy membership record
 * (members write their own).
 */

const TERMINAL_STATUSES = ['completed', 'cancelled']
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 25
/** How many extra pages to scan when non-organizer records are filtered out. */
const MAX_SCAN_ROUNDS = 5

type StewardCheck = (communityUri: string, did: string) => Promise<boolean>

/** Memoized per request: one board and authority lookup per (community, author). */
export const makeStewardCheck = (db: Database): StewardCheck => {
  const cache = new Map<string, Promise<boolean>>()
  return (communityUri, did) => {
    const key = `${communityUri} ${did}`
    let pending = cache.get(key)
    if (!pending) {
      pending = isCommunitySteward(db, communityUri, did)
      cache.set(key, pending)
    }
    return pending
  }
}

const isCommunitySteward = async (
  db: Database,
  communityUri: string,
  did: string,
): Promise<boolean> => {
  const board = await db.db
    .selectFrom('para_community_board')
    .where('uri', '=', communityUri)
    .select('creator')
    .executeTakeFirst()
  if (!board) return false
  if (board.creator === did) return true
  const authority = await getAuthoritySnapshot(db, communityUri, did)
  // The legacy fallback reads roles from the member's own membership record,
  // which they can write themselves; only verified authority events count.
  if (authority.usedLegacyFallback) return false
  return authority.roles.some((role) => role === 'owner' || role === 'moderator')
}

const normalizeLimit = (limit: number) =>
  Math.min(Math.max(limit || DEFAULT_LIMIT, 1), MAX_LIMIT)

type ActivityCursor = { startsAt: string; uri: string }

const encodeCursor = (cursor: ActivityCursor) =>
  Buffer.from(JSON.stringify([cursor.startsAt, cursor.uri])).toString(
    'base64url',
  )

const decodeCursor = (raw: string): ActivityCursor | undefined => {
  if (!raw) return undefined
  try {
    const [startsAt, uri] = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    )
    if (typeof startsAt === 'string' && typeof uri === 'string') {
      return { startsAt, uri }
    }
  } catch {
    // fall through
  }
  throw new ConnectError('Malformed cursor', Code.InvalidArgument)
}

const parseJson = (json: string): unknown => {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaCommunityActivities(req) {
    const isSteward = makeStewardCheck(db)
    const limit = normalizeLimit(req.limit)
    const time = req.time || 'any'
    // Upcoming reads soonest first; past and any read most recent first.
    const ascending = time === 'upcoming'
    let cursor = decodeCursor(req.cursor)
    const now = new Date().toISOString()

    const activities: Array<{
      uri: string
      cid: string
      author: string
      category: string
      communityUri: string
      communityName?: string
      record: unknown
      indexedAt: string
    }> = []
    let exhausted = false

    for (let round = 0; round < MAX_SCAN_ROUNDS; round++) {
      let builder = db.db
        .selectFrom('para_community_activity as activity')
        .leftJoin(
          'para_community_board as board',
          'board.uri',
          'activity.communityUri',
        )
        .selectAll('activity')
        .select('board.name as communityName')
      if (req.communityUri) {
        builder = builder.where('activity.communityUri', '=', req.communityUri)
      }
      if (req.category === 'social' || req.category === 'economic') {
        builder = builder.where('activity.category', '=', req.category)
      }
      const upcoming = sql<boolean>`(
        "activity"."status" not in (${sql.join(TERMINAL_STATUSES)})
        and (
          "activity"."status" = 'active'
          or coalesce("activity"."endsAt", "activity"."startsAt") >= ${now}
        )
      )`
      if (time === 'upcoming') builder = builder.where(upcoming)
      if (time === 'past') builder = builder.where(sql<boolean>`not ${upcoming}`)
      if (cursor) {
        const { startsAt, uri } = cursor
        builder = builder.where((eb) =>
          ascending
            ? eb.or([
                eb('activity.startsAt', '>', startsAt),
                eb.and([
                  eb('activity.startsAt', '=', startsAt),
                  eb('activity.uri', '>', uri),
                ]),
              ])
            : eb.or([
                eb('activity.startsAt', '<', startsAt),
                eb.and([
                  eb('activity.startsAt', '=', startsAt),
                  eb('activity.uri', '<', uri),
                ]),
              ]),
        )
      }
      const direction = ascending ? 'asc' : 'desc'
      const rows = await builder
        .orderBy('activity.startsAt', direction)
        .orderBy('activity.uri', direction)
        .limit(limit)
        .execute()

      for (const row of rows) {
        cursor = { startsAt: row.startsAt, uri: row.uri }
        if (!(await isSteward(row.communityUri, row.creator))) continue
        activities.push({
          uri: row.uri,
          cid: row.cid,
          author: row.creator,
          category: row.category,
          communityUri: row.communityUri,
          communityName: row.communityName ?? undefined,
          record: parseJson(row.json),
          indexedAt: row.indexedAt,
        })
        if (activities.length === limit) break
      }
      if (rows.length < limit) {
        exhausted = true
        break
      }
      if (activities.length === limit) break
    }

    return {
      itemsJson: JSON.stringify(activities),
      cursor: !exhausted && cursor ? encodeCursor(cursor) : '',
    }
  },

  async getParaCommunityActivity(req) {
    const row = await db.db
      .selectFrom('para_community_activity as activity')
      .leftJoin(
        'para_community_board as board',
        'board.uri',
        'activity.communityUri',
      )
      .where('activity.uri', '=', req.uri)
      .selectAll('activity')
      .select('board.name as communityName')
      .executeTakeFirst()
    const isSteward = makeStewardCheck(db)
    if (!row || !(await isSteward(row.communityUri, row.creator))) {
      throw new ConnectError('Activity not found', Code.NotFound)
    }

    // A ledger entry counts only when an organizer of the activity's own
    // community recorded it against this activity.
    const entries =
      row.category === 'economic'
        ? await db.db
            .selectFrom('para_community_ledger_entry')
            .where('activityUri', '=', row.uri)
            .where('communityUri', '=', row.communityUri)
            .orderBy('occurredAt', 'asc')
            .orderBy('uri', 'asc')
            .selectAll()
            .execute()
        : []
    const ledger: unknown[] = []
    for (const entry of entries) {
      if (!(await isSteward(entry.communityUri, entry.creator))) continue
      ledger.push({
        uri: entry.uri,
        cid: entry.cid,
        author: entry.creator,
        record: parseJson(entry.json),
        indexedAt: entry.indexedAt,
      })
    }

    return {
      activityJson: JSON.stringify({
        uri: row.uri,
        cid: row.cid,
        author: row.creator,
        category: row.category,
        communityUri: row.communityUri,
        communityName: row.communityName ?? undefined,
        record: parseJson(row.json),
        indexedAt: row.indexedAt,
      }),
      ledgerJson: JSON.stringify(ledger),
    }
  },

  async getParaCommunityWikiPages(req) {
    if (!req.communityUri) {
      throw new ConnectError('community is required', Code.InvalidArgument)
    }
    let builder = db.db
      .selectFrom('para_community_wiki_page')
      .where('communityUri', '=', req.communityUri)
      .selectAll()
    if (req.kind) builder = builder.where('kind', '=', req.kind)
    const rows = await builder
      .orderBy('updatedAt', 'desc')
      .orderBy('uri', 'desc')
      .execute()

    // Several organizers may publish the same slug; the latest update wins.
    const isSteward = makeStewardCheck(db)
    const bySlug = new Map<string, (typeof rows)[number]>()
    for (const row of rows) {
      if (bySlug.has(row.slug)) continue
      if (!(await isSteward(row.communityUri, row.creator))) continue
      bySlug.set(row.slug, row)
    }
    const pages = [...bySlug.values()]
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
            (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          a.title.localeCompare(b.title),
      )
      .map((row) => ({
        uri: row.uri,
        cid: row.cid,
        author: row.creator,
        record: parseJson(row.json),
        indexedAt: row.indexedAt,
      }))

    return { itemsJson: JSON.stringify(pages), cursor: '' }
  },
})
