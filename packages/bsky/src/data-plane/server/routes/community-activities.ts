import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import type { Service } from '../../../proto/bsky_connect.js'
import {
  filterActiveMembers,
  getAuthoritySnapshot,
} from '../community-authority.js'
import type { Database } from '../db/index.js'

/*
 * Community activities, their ledgers and wiki pages live in their authors'
 * repos, so anyone can write a record that names any community. Only records
 * by the community's current organizers are served: the board's creator, or
 * an owner or moderator by the verified authority events. Two weaker sources
 * are deliberately not used: the governance record (any account can publish
 * one under any community's slug) and the roles in a legacy membership record
 * (members write their own).
 *
 * Measurements by organizers are the official series; other active members'
 * are served as independent counts, and anyone else's not at all. An
 * acknowledgement counts only when its author is the account the claim names:
 * the recipientDid of a donation entry served in the ledger, or a contributor
 * listed by did in the activity. Only the latest per author, subject and role
 * is served.
 */

const TERMINAL_STATUSES = ['completed', 'cancelled']
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 25
/** How many extra pages to scan when non-organizer records are filtered out. */
const MAX_SCAN_ROUNDS = 5

/** Joins an activity to the community account it names, by profile URI. */
const accountMatches = sql<boolean>`'at://' || account.did || '/com.para.community.profile/self' = activity."communityUri"`

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
  // A community's offices are its chain's (OD-9).
  const authority = await getAuthoritySnapshot(db, communityUri, did)
  return authority.roles.some(
    (role) => role === 'owner' || role === 'moderator',
  )
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

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

/** DIDs the activity lists as contributors. */
const contributorDids = (record: unknown): Set<string> => {
  const list = asObject(record).contributors
  const dids = new Set<string>()
  if (!Array.isArray(list)) return dids
  for (const item of list) {
    const did = asObject(item).did
    if (typeof did === 'string' && did.startsWith('did:')) dids.add(did)
  }
  return dids
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
        .leftJoin('para_community_account as account', (join) =>
          join.on(accountMatches),
        )
        .selectAll('activity')
        .select(sql<string | null>`account.name`.as('communityName'))
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
      if (time === 'past')
        builder = builder.where(sql<boolean>`not ${upcoming}`)
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
      .leftJoin('para_community_account as account', (join) =>
        join.on(accountMatches),
      )
      .where('activity.uri', '=', req.uri)
      .selectAll('activity')
      .select(sql<string | null>`account.name`.as('communityName'))
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

    // Ledger entries served above, by uri, for checking recipients' answers.
    const servedEntries = new Map<string, { cid: string; recipient?: string }>()
    for (const entry of entries) {
      if (!ledger.some((e) => asObject(e).uri === entry.uri)) continue
      const record = asObject(parseJson(entry.json))
      servedEntries.set(entry.uri, {
        cid: entry.cid,
        recipient:
          record.entryType === 'donation' &&
          typeof record.recipientDid === 'string'
            ? record.recipientDid
            : undefined,
      })
    }

    const measurementRows = await db.db
      .selectFrom('para_community_activity_measurement')
      .where('activityUri', '=', row.uri)
      .where('communityUri', '=', row.communityUri)
      .orderBy('measuredAt', 'asc')
      .orderBy('uri', 'asc')
      .selectAll()
      .execute()
    const official = new Set<string>()
    for (const m of measurementRows) {
      if (await isSteward(m.communityUri, m.creator)) official.add(m.creator)
    }
    const members = await filterActiveMembers(
      db,
      row.communityUri,
      measurementRows.map((m) => m.creator).filter((did) => !official.has(did)),
    )
    const measurements = measurementRows
      .filter((m) => official.has(m.creator) || members.has(m.creator))
      .map((m) => ({
        uri: m.uri,
        cid: m.cid,
        author: m.creator,
        official: official.has(m.creator),
        edited: m.edited,
        record: parseJson(m.json),
        indexedAt: m.indexedAt,
      }))

    const ackRows = await db.db
      .selectFrom('para_community_activity_acknowledgement')
      .where('activityUri', '=', row.uri)
      .where('communityUri', '=', row.communityUri)
      .orderBy('occurredAt', 'desc')
      .orderBy('uri', 'desc')
      .selectAll()
      .execute()
    const contributors = contributorDids(parseJson(row.json))
    const answered = new Set<string>()
    const acknowledgements: unknown[] = []
    for (const ack of ackRows) {
      let subjectCid: string | undefined
      if (ack.role === 'recipient') {
        const entry = servedEntries.get(ack.subjectUri)
        if (entry?.recipient === ack.creator) subjectCid = entry.cid
      } else if (ack.role === 'contributor') {
        if (ack.subjectUri === row.uri && contributors.has(ack.creator)) {
          subjectCid = row.cid
        }
      }
      if (!subjectCid) continue
      // Rows are newest first, so the first per key is the one in force.
      const key = `${ack.creator} ${ack.subjectUri} ${ack.role}`
      if (answered.has(key)) continue
      answered.add(key)
      acknowledgements.push({
        uri: ack.uri,
        cid: ack.cid,
        author: ack.creator,
        role: ack.role,
        response: ack.response,
        subjectUri: ack.subjectUri,
        current: ack.subjectCid === subjectCid,
        edited: ack.edited,
        record: parseJson(ack.json),
        indexedAt: ack.indexedAt,
      })
    }
    acknowledgements.reverse()

    return {
      measurementsJson: JSON.stringify(measurements),
      acknowledgementsJson: JSON.stringify(acknowledgements),
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
