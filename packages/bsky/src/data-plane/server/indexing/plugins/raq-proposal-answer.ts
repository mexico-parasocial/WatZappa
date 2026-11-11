import type { Selectable } from 'kysely'
import type { Cid } from '@atproto/lex-schema'
import { type AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { com } from '../../../../lexicons.js'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

type ProposalAnswer = Selectable<DatabaseSchemaType['raq_proposal_answer']>

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  obj: com.para.raq.proposalAnswer.Main,
  timestamp: string,
): Promise<ProposalAnswer | null> => {
  const inserted = await db
    .insertInto('raq_proposal_answer')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      subject: obj.subject,
      value: obj.value,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) =>
      oc.column('uri').doUpdateSet({
        cid: cid.toString(),
        subject: obj.subject,
        value: obj.value,
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
): Promise<ProposalAnswer | null> => {
  const deleted = await db
    .deleteFrom('raq_proposal_answer')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ?? null
}

const notifsForInsert = () => {
  return []
}

const notifsForDelete = (deleted: ProposalAnswer) => {
  return { notifs: [], toDelete: [deleted.uri] }
}

export type PluginType = ReturnType<typeof makePlugin>

export const makePlugin = (db: Database, background: BackgroundQueue) => {
  return new RecordProcessor(db, background, {
    schema: com.para.raq.proposalAnswer.main,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert,
    notifsForDelete,
  })
}

export default makePlugin
