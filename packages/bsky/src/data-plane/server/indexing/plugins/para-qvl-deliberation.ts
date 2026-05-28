// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface DeliberationRecord {
  proposal: string
  community: string
  author: string
  body: string
  stance?: string
  createdAt: string
}

type ParaQvldDeliberationStatement = Selectable<
  DatabaseSchemaType['para_qvld_deliberation_statement']
>

const lexId = 'com.para.community.deliberation'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: DeliberationRecord,
  timestamp: string,
): Promise<ParaQvldDeliberationStatement | null> => {
  const inserted = await db
    .insertInto('para_qvld_deliberation_statement')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      proposal: obj.proposal,
      body: obj.body,
      stance: obj.stance ?? 'neutral',
      agreeCount: 0,
      disagreeCount: 0,
      passCount: 0,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => null

const notifsForInsert = () => []

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<ParaQvldDeliberationStatement | null> => {
  const deleted = await db
    .deleteFrom('para_qvld_deliberation_statement')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = (deleted: ParaQvldDeliberationStatement) => {
  return { notifs: [], toDelete: [deleted.uri] }
}

export type PluginType = RecordProcessor<
  DeliberationRecord,
  ParaQvldDeliberationStatement
>

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
