// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface ProposalVoteRecord {
  subject: string
  value: number
  voteNullifier?: string
  eligibilityProofRef?: string
  createdAt: string
}

type ProposalVote = Selectable<DatabaseSchemaType['raq_proposal_vote']>
type IndexedProposalVote = {
  record: ProposalVote
}

const lexId = 'com.para.raq.proposalVote'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ProposalVoteRecord,
  timestamp: string,
): Promise<IndexedProposalVote | null> => {
  const record = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    subject: obj.subject,
    value: obj.value,
    voteNullifier: normalizeOpaqueProofField(obj.voteNullifier, 128),
    eligibilityProofRef: normalizeOpaqueProofField(obj.eligibilityProofRef, 512),
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    indexedAt: timestamp,
  }

  const existing = record.voteNullifier
    ? await db
        .selectFrom('raq_proposal_vote')
        .where('subject', '=', record.subject)
        .where('voteNullifier', '=', record.voteNullifier)
        .select(['uri'])
        .executeTakeFirst()
    : await db
        .selectFrom('raq_proposal_vote')
        .where('creator', '=', record.creator)
        .where('subject', '=', record.subject)
        .select(['uri'])
        .executeTakeFirst()

  const inserted = existing
    ? await db
        .updateTable('raq_proposal_vote')
        .set(record)
        .where('uri', '=', existing.uri)
        .returningAll()
        .executeTakeFirst()
    : await db
        .insertInto('raq_proposal_vote')
        .values(record)
        .returningAll()
        .executeTakeFirst()

  if (!inserted) return null
  return { record: inserted }
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const normalizeOpaqueProofField = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedProposalVote | null> => {
  const deleted = await db
    .deleteFrom('raq_proposal_vote')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ? { record: deleted } : null
}

const notifsForInsert = () => {
  return []
}

const notifsForDelete = (
  deleted: IndexedProposalVote,
  _replacedBy: IndexedProposalVote | null,
) => {
  return { notifs: [], toDelete: [deleted.record.uri] }
}

export type PluginType = RecordProcessor<
  ProposalVoteRecord,
  IndexedProposalVote
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
