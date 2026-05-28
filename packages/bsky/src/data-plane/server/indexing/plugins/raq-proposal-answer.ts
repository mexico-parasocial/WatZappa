// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface ProposalAnswerRecord {
  subject: string
  value: number
  createdAt: string
}

type ProposalAnswer = Selectable<DatabaseSchemaType['raq_proposal_answer']>
type IndexedProposalAnswer = {
  record: ProposalAnswer
}

const lexId = 'com.para.raq.proposalAnswer'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ProposalAnswerRecord,
  timestamp: string,
): Promise<IndexedProposalAnswer | null> => {
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
      oc.doUpdateSet({
        cid: cid.toString(),
        subject: obj.subject,
        value: obj.value,
        createdAt: normalizeDatetimeAlways(obj.createdAt),
        indexedAt: timestamp,
      }),
    )
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
): Promise<IndexedProposalAnswer | null> => {
  const deleted = await db
    .deleteFrom('raq_proposal_answer')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ? { record: deleted } : null
}

const notifsForInsert = () => {
  return []
}

const notifsForDelete = (
  deleted: IndexedProposalAnswer,
  _replacedBy: IndexedProposalAnswer | null,
) => {
  return { notifs: [], toDelete: [deleted.record.uri] }
}

export type PluginType = RecordProcessor<
  ProposalAnswerRecord,
  IndexedProposalAnswer
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

export default makePlugin
