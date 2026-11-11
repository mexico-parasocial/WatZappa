import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import type { Service } from '../../../proto/bsky_connect.js'
import type { Database } from '../db/index.js'
import {
  type FollowItem,
  type FollowStatus,
  type FollowSummary,
  type FollowThroughView,
  type FollowUpdate,
  buildFollowThroughTree,
  isFollowStatus,
  isFollowable,
  summarizeFollowThrough,
} from '../follow-through.js'
import { selectCandidateCommunityBoard } from './cabildeo.js'
import { makeStewardCheck } from './community-activities.js'

/*
 * Compromisos are served only when three things hold, each checked here so a
 * record written by anyone cannot put words in a community's mouth:
 *  - the cabildeo has a followable result (`isFollowable`);
 *  - the record names the board the cabildeo's community resolves to, and the
 *    cabildeo's winning option;
 *  - its author is a current steward of that board (the same check community
 *    activities use). Self-declared roles and the cabildeo's own author do not
 *    count.
 */

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 25
/** How many extra pages of cabildeos to scan when filters drop some. */
const MAX_SCAN_ROUNDS = 5

export type FollowThroughQuery = {
  cabildeoUri?: string
  communityUri?: string
  itemUri?: string
  status?: string
  overdue?: boolean
  limit?: number
  cursor?: string
}

export type FollowThroughResult = {
  items: FollowThroughView[]
  summaries: FollowSummary[]
  cursor?: string
}

const normalizeLimit = (limit: number | undefined) =>
  Math.min(Math.max(limit || DEFAULT_LIMIT, 1), MAX_LIMIT)

type GroupCursor = { latest: string; cabildeo: string }

const encodeCursor = (cursor: GroupCursor) =>
  Buffer.from(JSON.stringify([cursor.latest, cursor.cabildeo])).toString(
    'base64url',
  )

const decodeCursor = (raw: string | undefined): GroupCursor | undefined => {
  if (!raw) return undefined
  try {
    const [latest, cabildeo] = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    )
    if (typeof latest === 'string' && typeof cabildeo === 'string') {
      return { latest, cabildeo }
    }
  } catch {
    // fall through
  }
  throw new ConnectError('Malformed cursor', Code.InvalidArgument)
}

const readViewTier = (json: string | undefined): string | undefined => {
  if (!json) return undefined
  try {
    const tier = (JSON.parse(json) as { minimumViewTier?: unknown })
      .minimumViewTier
    return typeof tier === 'string' ? tier : undefined
  } catch {
    return undefined
  }
}

const parseUris = (json: string): string[] => {
  try {
    const value: unknown = JSON.parse(json)
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string')
      : []
  } catch {
    return []
  }
}

/** Reads authorized follow-through for a database. Exported for tests. */
export function makeFollowThroughReader(db: Database, now: () => Date) {
  const isSteward = makeStewardCheck(db)
  const eligibility = new Map<
    string,
    Promise<{ boardUri: string; winningOption: number } | null>
  >()

  const eligibleCabildeo = (cabildeoUri: string) => {
    let pending = eligibility.get(cabildeoUri)
    if (!pending) {
      pending = (async () => {
        const row = await db.db
          .selectFrom('cabildeo_cabildeo')
          .where('uri', '=', cabildeoUri)
          .select([
            'community',
            'kind',
            'phase',
            'winningOption',
            'isTie',
            'voteCount',
            'minQuorum',
          ])
          .executeTakeFirst()
        if (!row) return null
        const record = await db.db
          .selectFrom('record')
          .where('uri', '=', cabildeoUri)
          .select('json')
          .executeTakeFirst()
        if (!isFollowable(row, readViewTier(record?.json))) return null
        const board = await selectCandidateCommunityBoard(db, row.community)
        if (!board) return null
        return {
          boardUri: board.uri,
          winningOption: row.winningOption as number,
        }
      })()
      eligibility.set(cabildeoUri, pending)
    }
    return pending
  }

  /** Every served root of one cabildeo, with children. */
  const loadTree = async (
    cabildeoUri: string,
    includeUpdates: boolean,
  ): Promise<FollowThroughView[]> => {
    const eligible = await eligibleCabildeo(cabildeoUri)
    if (!eligible) return []

    const itemRows = await db.db
      .selectFrom('para_follow_through')
      .where('cabildeo', '=', cabildeoUri)
      .where('communityUri', '=', eligible.boardUri)
      .where('optionIndex', '=', eligible.winningOption)
      .selectAll()
      .execute()
    const items: FollowItem[] = []
    for (const row of itemRows) {
      if (!(await isSteward(eligible.boardUri, row.creator))) continue
      items.push({
        uri: row.uri,
        cid: row.cid,
        author: row.creator,
        cabildeo: row.cabildeo,
        communityUri: row.communityUri,
        optionIndex: row.optionIndex,
        parent: row.parent,
        title: row.title,
        summary: row.summary,
        responsibleDid: row.responsibleDid,
        responsibleLabel: row.responsibleLabel,
        dueAt: row.dueAt,
        edited: row.edited,
        createdAt: row.createdAt,
      })
    }
    if (items.length === 0) return []
    const itemUris = items.map((item) => item.uri)

    const updateRows = await db.db
      .selectFrom('para_follow_through_update')
      .where('subject', 'in', itemUris)
      .selectAll()
      .execute()
    const updates: FollowUpdate[] = []
    for (const row of updateRows) {
      if (!isFollowStatus(row.status)) continue
      if (!(await isSteward(eligible.boardUri, row.creator))) continue
      updates.push({
        uri: row.uri,
        author: row.creator,
        subject: row.subject,
        status: row.status as FollowStatus,
        progress: row.progress,
        note: row.note,
        evidenceUris: parseUris(row.evidenceUris),
        dueAt: row.dueAt,
        edited: row.edited,
        occurredAt: row.occurredAt,
        createdAt: row.createdAt,
      })
    }

    const withdrawn = new Map<string, number>()
    const gone = await db.db
      .selectFrom('para_follow_through_commit as c')
      .where('c.kind', '=', 'update')
      .where('c.subject', 'in', itemUris)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('para_follow_through_update as u')
              .whereRef('u.uri', '=', 'c.uri')
              .select('u.uri'),
          ),
        ),
      )
      .select(['c.subject', 'c.creator', sql<number>`count(*)`.as('count')])
      .groupBy(['c.subject', 'c.creator'])
      .execute()
    for (const row of gone) {
      if (!(await isSteward(eligible.boardUri, row.creator))) continue
      withdrawn.set(
        row.subject,
        (withdrawn.get(row.subject) ?? 0) + Number(row.count),
      )
    }

    return buildFollowThroughTree(items, updates, {
      now: now(),
      includeUpdates,
      withdrawn,
    })
  }

  const list = async (
    query: FollowThroughQuery,
  ): Promise<FollowThroughResult> => {
    if (query.status && !isFollowStatus(query.status)) {
      throw new ConnectError('Unknown status', Code.InvalidArgument)
    }
    const limit = normalizeLimit(query.limit)
    const keep = (view: FollowThroughView) =>
      (!query.status || view.status === query.status) &&
      (!query.overdue || view.overdue)

    if (query.cabildeoUri) {
      const tree = await loadTree(query.cabildeoUri, false)
      return {
        items: tree.filter(keep),
        summaries: tree.length
          ? [summarizeFollowThrough(query.cabildeoUri, tree)]
          : [],
      }
    }

    // Paged by cabildeo, newest activity first, so one cabildeo's compromisos
    // are never split across pages.
    let cursor = decodeCursor(query.cursor)
    const items: FollowThroughView[] = []
    const summaries: FollowSummary[] = []
    let collected = 0
    let exhausted = false
    let next: GroupCursor | undefined

    for (let round = 0; round < MAX_SCAN_ROUNDS && !exhausted; round++) {
      const latest = sql<string>`max("createdAt")`
      let builder = db.db
        .selectFrom('para_follow_through')
        .select(['cabildeo', latest.as('latest')])
        .groupBy('cabildeo')
      if (query.communityUri) {
        builder = builder.where('communityUri', '=', query.communityUri)
      }
      if (cursor) {
        builder = builder.having(
          sql<boolean>`(max("createdAt"), "cabildeo") < (${cursor.latest}, ${cursor.cabildeo})`,
        )
      }
      // One extra row tells whether another page exists.
      const fetched = await builder
        .orderBy(latest, 'desc')
        .orderBy('cabildeo', 'desc')
        .limit(limit + 1)
        .execute()
      const groups = fetched.slice(0, limit)
      const more = fetched.length > limit
      exhausted = !more

      for (const [index, group] of groups.entries()) {
        cursor = { latest: group.latest, cabildeo: group.cabildeo }
        const tree = await loadTree(group.cabildeo, false)
        const matching = tree.filter(keep)
        if (matching.length === 0) continue
        items.push(...matching)
        summaries.push(summarizeFollowThrough(group.cabildeo, tree))
        if (++collected === limit) {
          if (more || index < groups.length - 1) next = cursor
          break
        }
      }
      if (collected === limit) break
    }

    // The scan bound was hit with more groups unread: let the caller continue.
    if (!next && !exhausted) next = cursor

    return {
      items,
      summaries,
      cursor: next ? encodeCursor(next) : undefined,
    }
  }

  const get = async (itemUri: string): Promise<FollowThroughView> => {
    const row = await db.db
      .selectFrom('para_follow_through')
      .where('uri', '=', itemUri)
      .select('cabildeo')
      .executeTakeFirst()
    const tree = row ? await loadTree(row.cabildeo, true) : []
    const found = tree
      .flatMap((root) => [root, ...(root.children ?? [])])
      .find((view) => view.uri === itemUri)
    if (!found) throw new ConnectError('Not found', Code.NotFound)
    return found
  }

  return { list, get }
}

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaFollowThrough(req) {
    const reader = makeFollowThroughReader(db, () => new Date())
    if (req.itemUri) {
      const item = await reader.get(req.itemUri)
      return {
        itemsJson: JSON.stringify([item]),
        summariesJson: '[]',
        cursor: '',
      }
    }
    const result = await reader.list({
      cabildeoUri: req.cabildeoUri || undefined,
      communityUri: req.communityUri || undefined,
      status: req.status || undefined,
      overdue: req.overdue,
      limit: req.limit,
      cursor: req.cursor || undefined,
    })
    return {
      itemsJson: JSON.stringify(result.items),
      summariesJson: JSON.stringify(result.summaries),
      cursor: result.cursor ?? '',
    }
  },
})
