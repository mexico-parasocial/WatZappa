import { Selectable } from 'kysely'
import { Cid } from '@atproto/lex'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { com } from '../../../../lexicons.js'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

type Proposal = Selectable<DatabaseSchemaType['raq_proposal']>

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  obj: com.para.raq.proposal.Main,
  timestamp: string,
): Promise<Proposal | null> => {
  const inserted = await db
    .insertInto('raq_proposal')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      text: obj.text,
      targetAxis: obj.targetAxis || null,
      targetCommunity: obj.targetCommunity || null,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) =>
      oc.column('uri').doUpdateSet({
        cid: cid.toString(),
        text: obj.text,
        targetAxis: obj.targetAxis || null,
        targetCommunity: obj.targetCommunity || null,
        createdAt: normalizeDatetimeAlways(obj.createdAt),
        indexedAt: timestamp,
      }),
    )
    .returningAll()
    .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<Proposal | null> => {
  const deleted = await db
    .deleteFrom('raq_proposal')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ?? null
}

const notifsForInsert = () => {
  return []
}

const notifsForDelete = (deleted: Proposal) => {
  return { notifs: [], toDelete: [deleted.uri] }
}

export type PluginType = ReturnType<typeof makePlugin>

export const makePlugin = (db: Database, background: BackgroundQueue) => {
  return new RecordProcessor(db, background, {
    schema: com.para.raq.proposal.main,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert,
    notifsForDelete,
  })
}

export default makePlugin
