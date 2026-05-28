// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface ProposalRecord {
  text: string
  targetAxis?: string
  targetCommunity?: string
  createdAt: string
}

type Proposal = Selectable<DatabaseSchemaType['raq_proposal']>
type IndexedProposal = {
  record: Proposal
}

const lexId = 'com.para.raq.proposal'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ProposalRecord,
  timestamp: string,
): Promise<IndexedProposal | null> => {
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
      oc.doUpdateSet({
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

  if (!inserted) return null
  return { record: inserted }
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedProposal | null> => {
  const deleted = await db
    .deleteFrom('raq_proposal')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ? { record: deleted } : null
}

const notifsForInsert = () => {
  return []
}

const notifsForDelete = (
  deleted: IndexedProposal,
  _replacedBy: IndexedProposal | null,
) => {
  return { notifs: [], toDelete: [deleted.record.uri] }
}

export type PluginType = RecordProcessor<ProposalRecord, IndexedProposal>

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
