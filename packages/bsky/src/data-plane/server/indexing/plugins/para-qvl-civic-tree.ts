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

interface CivicTreeRecord {
  proposal: string
  community: string
  author: string
  body: string
  stance?: string
  createdAt: string
}

type ParaQvldCivicTreeStatement = Selectable<
  DatabaseSchemaType['para_qvld_civicTree_statement']
>

const lexId = 'com.para.community.civicTree'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: CivicTreeRecord,
  timestamp: string,
): Promise<ParaQvldCivicTreeStatement | null> => {
  const inserted = await db
    .insertInto('para_qvld_civicTree_statement')
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
): Promise<ParaQvldCivicTreeStatement | null> => {
  const deleted = await db
    .deleteFrom('para_qvld_civicTree_statement')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = (deleted: ParaQvldCivicTreeStatement) => {
  return { notifs: [], toDelete: [deleted.uri] }
}

export type PluginType = RecordProcessor<
  CivicTreeRecord,
  ParaQvldCivicTreeStatement
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
