import type { ServiceImpl } from '@connectrpc/connect'
import type { Service } from '../../../proto/bsky_connect.js'
import { isConcludable, pickConclusions } from '../conclusion.js'
import type { Database } from '../db/index.js'
import { selectCandidateCommunityBoard } from './cabildeo.js'
import { makeStewardCheck } from './community-activities.js'

/*
 * A conclusion is served only when the cabildeo is a forum or persuasion one
 * (`isConcludable`), the record names the board the cabildeo's community
 * resolves to, and its author is a current steward of that board. The
 * cabildeo's own author and self-declared roles do not count.
 */

type CitedPosition = {
  uri: string
  author: string
  stance: string
  optionIndex?: number
  text: string
}

type ConclusionView = {
  uri: string
  cid: string
  author: string
  cabildeo: string
  communityUri: string
  text: string
  cited: CitedPosition[]
  officialThreadSlug?: string
  reviewDate?: string
  followUp?: string
  edited: boolean
  createdAt: string
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

/** Reads authorized conclusions for a database. Exported for tests. */
export function makeConclusionReader(db: Database) {
  const get = async (
    cabildeoUri: string,
  ): Promise<{
    conclusion?: ConclusionView
    earlier: ConclusionView[]
    communityUri?: string
    officialThreadSlug?: string
  }> => {
    const isSteward = makeStewardCheck(db)
    const empty = { earlier: [] }
    const cabildeo = await db.db
      .selectFrom('cabildeo_cabildeo')
      .where('uri', '=', cabildeoUri)
      .select(['community', 'kind', 'phase'])
      .executeTakeFirst()
    if (!cabildeo) return empty
    const record = await db.db
      .selectFrom('record')
      .where('uri', '=', cabildeoUri)
      .select('json')
      .executeTakeFirst()
    const tier = readViewTier(record?.json)
    const isOfficialPoll =
      cabildeo.kind === 'activity' &&
      cabildeo.phase === 'resolved' &&
      tier === 'public'
    if (!isOfficialPoll && !isConcludable(cabildeo, tier)) return empty
    const board = await selectCandidateCommunityBoard(db, cabildeo.community)
    if (!board) return empty
    let threadSlug: string | undefined
    let deadline: string | undefined
    if (isOfficialPoll) {
      const closePolicy = await db.db
        .selectFrom('cabildeo_close_policy')
        .where('cabildeo', '=', cabildeoUri)
        .select('deadline')
        .executeTakeFirst()
      deadline = closePolicy?.deadline ?? undefined
      const tally = await db.db
        .selectFrom('cabildeo_final_tally')
        .where('cabildeo', '=', cabildeoUri)
        .select('finalizedAt')
        .executeTakeFirst()
      if (!deadline || !tally || Date.parse(deadline) > Date.now()) return empty
      deadline = tally.finalizedAt

      const pins = await db.db
        .selectFrom('para_community_wiki_page')
        .where('communityUri', '=', board.uri)
        .selectAll()
        .orderBy('updatedAt', 'desc')
        .orderBy('uri', 'desc')
        .execute()
      const seen = new Set<string>()
      for (const pin of pins) {
        if (seen.has(pin.slug) || !(await isSteward(board.uri, pin.creator)))
          continue
        seen.add(pin.slug)
        if (!pin.pinned || pin.kind !== 'megathread') continue
        const data = JSON.parse(pin.json) as {
          pollUri?: string
          threadUri?: string
        }
        if (data.pollUri !== cabildeoUri || !data.threadUri) continue
        if (threadSlug) return empty
        threadSlug = pin.slug
      }
      if (!threadSlug) return empty
    }
    // Told even when there is no conclusion yet, so a steward's client can
    // name the board in the one it writes.
    const withBoard = {
      earlier: [],
      communityUri: board.uri,
      officialThreadSlug: threadSlug,
    }

    const rows = await db.db
      .selectFrom('para_conclusion')
      .where('para_conclusion.cabildeo', '=', cabildeoUri)
      .where('para_conclusion.communityUri', '=', board.uri)
      .innerJoin(
        'para_follow_through_commit as original',
        'original.uri',
        'para_conclusion.uri',
      )
      .selectAll('para_conclusion')
      .select([
        'original.json as committedJson',
        'original.indexedAt as firstIndexedAt',
      ])
      .execute()
    const served: typeof rows = []
    for (const row of rows) {
      const metadata = JSON.parse(row.committedJson) as {
        officialThreadSlug?: string
      }
      if (metadata.officialThreadSlug !== threadSlug) continue
      if (deadline && Date.parse(row.firstIndexedAt) < Date.parse(deadline))
        continue
      if (await isSteward(board.uri, row.creator)) served.push(row)
    }
    if (served.length === 0) return withBoard

    // Cited positions must belong to this cabildeo; others are dropped.
    const citedUris = [...new Set(served.flatMap((r) => parseUris(r.cited)))]
    const positions = citedUris.length
      ? await db.db
          .selectFrom('cabildeo_position')
          .where('cabildeo', '=', cabildeoUri)
          .where('uri', 'in', citedUris)
          .select(['uri', 'creator', 'stance', 'optionIndex', 'text'])
          .execute()
      : []
    const byUri = new Map(positions.map((p) => [p.uri, p]))

    const toView = (row: (typeof served)[number]): ConclusionView => ({
      uri: row.uri,
      cid: row.cid,
      author: row.creator,
      cabildeo: row.cabildeo,
      communityUri: row.communityUri,
      text: row.text,
      cited: parseUris(row.cited).flatMap((uri) => {
        const p = byUri.get(uri)
        return p
          ? [
              {
                uri: p.uri,
                author: p.creator,
                stance: p.stance,
                optionIndex: p.optionIndex ?? undefined,
                text: p.text,
              },
            ]
          : []
      }),
      officialThreadSlug: threadSlug,
      reviewDate: threadSlug
        ? (JSON.parse(row.committedJson) as { reviewDate?: string }).reviewDate
        : undefined,
      followUp: row.followUp ?? undefined,
      edited: row.edited,
      createdAt: row.createdAt,
    })

    const { current, earlier } = pickConclusions(served)
    return {
      conclusion: current ? toView(current) : undefined,
      earlier: earlier.map(toView),
      communityUri: board.uri,
      officialThreadSlug: threadSlug,
    }
  }

  return { get }
}

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaConclusion(req) {
    const result = await makeConclusionReader(db).get(req.cabildeoUri)
    return {
      conclusionJson: result.conclusion
        ? JSON.stringify(result.conclusion)
        : '',
      earlierJson: JSON.stringify(result.earlier),
      communityUri: result.communityUri ?? '',
    }
  },
})
