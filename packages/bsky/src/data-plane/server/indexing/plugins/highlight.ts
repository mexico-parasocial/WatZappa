// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface HighlightRecord {
  subjectUri: string
  subjectCid?: string
  text: string
  start: number
  end: number
  color: string
  tag?: string
  community?: string
  state?: string
  party?: string
  visibility: string
  createdAt: string
}

type HighlightAnnotation = Selectable<
  DatabaseSchemaType['highlight_annotation']
>
type IndexedHighlight = {
  record: HighlightAnnotation
}

const lexId = 'com.para.highlight.annotation'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: HighlightRecord,
  timestamp: string,
): Promise<IndexedHighlight | null> => {
  const start = Math.max(0, Math.trunc(obj.start))
  const end = Math.max(start, Math.trunc(obj.end))

  const inserted = await db
    .insertInto('highlight_annotation')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      subjectUri: obj.subjectUri,
      subjectCid: obj.subjectCid || null,
      text: obj.text,
      start,
      end,
      color: obj.color,
      tag: obj.tag || null,
      community: obj.community || null,
      state: obj.state || null,
      party: obj.party || null,
      visibility: obj.visibility,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  if (!inserted) return null
  return { record: inserted }
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedHighlight | null> => {
  const deleted = await db
    .deleteFrom('highlight_annotation')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ? { record: deleted } : null
}

const notifsForInsert = () => {
  return []
}

const notifsForDelete = (
  deleted: IndexedHighlight,
  _replacedBy: IndexedHighlight | null,
) => {
  return { notifs: [], toDelete: [deleted.record.uri] }
}

export type PluginType = RecordProcessor<HighlightRecord, IndexedHighlight>

export const makePlugin = (
  db: Database,
  background: BackgroundQueue,
): PluginType => {
  return new RecordProcessor(db, background, {
    lexId,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert,
    notifsForDelete,
  })
}

export default makePlugin
