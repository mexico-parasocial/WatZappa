// @ts-nocheck
import type { Selectable } from 'kysely'
import type { CID } from 'multiformats/cid'
import { type AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

interface DeliberationRecord {
  proposal: string
  community?: string
  author: string
  body: string
  stance?: string
  createdAt: string
}

type ParaDeliberationStatement = Selectable<
  DatabaseSchemaType['para_deliberation_statement']
>

const lexId = 'com.para.community.deliberation'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: DeliberationRecord,
  timestamp: string,
): Promise<ParaDeliberationStatement | null> => {
  // @NOTE a remote repository may name any author in its payload.
  if (obj.author !== uri.host) return null

  const inserted = await db
    .insertInto('para_deliberation_statement')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      proposal: obj.proposal,
      community: obj.community ?? null,
      body: obj.body,
      stance: obj.stance ?? null,
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
): Promise<ParaDeliberationStatement | null> => {
  const deleted = await db
    .deleteFrom('para_deliberation_statement')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = (deleted: ParaDeliberationStatement) => {
  return { notifs: [], toDelete: [deleted.uri] }
}

export type PluginType = RecordProcessor<
  DeliberationRecord,
  ParaDeliberationStatement
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
