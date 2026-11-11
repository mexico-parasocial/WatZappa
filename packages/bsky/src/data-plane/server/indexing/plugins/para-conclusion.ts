import type { Insertable, Selectable } from 'kysely'
import type { Cid } from '@atproto/lex-data'
import type { l } from '@atproto/lex-schema'
import type { AtUri } from '@atproto/syntax'
import type { BackgroundQueue } from '../../background.js'
import { MAX_CITED } from '../../conclusion.js'
import type { DatabaseSchema } from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import {
  type ParaConclusion,
  conclusionTableName,
} from '../../db/tables/para-conclusion.js'
import { RecordProcessor } from '../processor.js'
import {
  commit,
  datetime,
  isAtUri,
  isObject,
  sortableCreatedAt,
  str,
} from './para-follow-through.js'

/*
 * Conclusions are written to a steward's own repo and indexed whoever wrote
 * them. Whether the author may speak for the cabildeo's community is decided
 * when they are read (data-plane/server/routes/conclusion.ts). The first
 * version of each is kept in `para_follow_through_commit`, as for compromisos,
 * so an edit is served as written first and flagged.
 */

type LexId = l.RecordSchema['$type']

const CONCLUSION: LexId = 'com.para.civic.conclusion'

const POSITION_COLLECTION = '/com.para.civic.position/'

type ConclusionFields = {
  cabildeo: string
  communityUri: string
  text: string
  cited: string[]
  officialThreadSlug?: string
  reviewDate?: string
  followUp: string | null
  createdAt: string | null
}

const insertConclusion = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  obj: unknown,
  timestamp: string,
): Promise<Selectable<ParaConclusion> | null> => {
  if (!isObject(obj) || !isAtUri(obj.cabildeo) || !isAtUri(obj.communityUri)) {
    return null
  }
  const text = str(obj.text, 3000)
  if (!text) return null
  let cited: string[] = []
  if (obj.cited !== undefined) {
    if (!Array.isArray(obj.cited) || obj.cited.length > MAX_CITED) return null
    cited = [...new Set(obj.cited)].filter(
      (value): value is string =>
        isAtUri(value) && value.includes(POSITION_COLLECTION),
    )
    if (cited.length !== new Set(obj.cited).size) return null
  }
  if (obj.followUp !== undefined && !isAtUri(obj.followUp)) return null
  const incoming: ConclusionFields = {
    cabildeo: obj.cabildeo,
    communityUri: obj.communityUri,
    text,
    cited,
    ...(typeof obj.officialThreadSlug === 'string' &&
    obj.officialThreadSlug.length <= 80
      ? { officialThreadSlug: obj.officialThreadSlug }
      : {}),
    ...(typeof obj.reviewDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(obj.reviewDate) &&
    datetime(obj.reviewDate + 'T00:00:00Z')?.slice(0, 10) === obj.reviewDate
      ? { reviewDate: obj.reviewDate }
      : {}),
    followUp: (obj.followUp as string | undefined) ?? null,
    createdAt: datetime(obj.createdAt) ?? null,
  }
  const { committed, edited, firstIndexedAt } = await commit(
    db,
    uri,
    'conclusion',
    incoming.cabildeo,
    incoming,
    timestamp,
  )
  const values: Insertable<ParaConclusion> = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    cabildeo: committed.cabildeo,
    communityUri: committed.communityUri,
    text: committed.text,
    cited: JSON.stringify(committed.cited),
    followUp: committed.followUp,
    edited,
    createdAt: sortableCreatedAt(committed.createdAt, firstIndexedAt),
    indexedAt: timestamp,
  }
  return (
    (await db
      .insertInto(conclusionTableName)
      .values(values)
      .onConflict((oc) => oc.doNothing())
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

export type ConclusionPluginType = RecordProcessor<
  l.RecordSchema,
  Selectable<ParaConclusion>
>

// @NOTE a deleted conclusion is a retraction and disappears. Its commit row
// stays, so re-indexing the same record cannot change what it first said.
export const makePlugin = (
  db: Database,
  background: BackgroundQueue,
): ConclusionPluginType =>
  new RecordProcessor(db, background, {
    lexId: CONCLUSION,
    insertFn: insertConclusion,
    findDuplicate: async () => null,
    deleteFn: async (db: DatabaseSchema, uri: AtUri) =>
      (await db
        .deleteFrom(conclusionTableName)
        .where('uri', '=', uri.toString())
        .returningAll()
        .executeTakeFirst()) ?? null,
    notifsForInsert: () => [],
    notifsForDelete: () => ({ notifs: [], toDelete: [] }),
  })
