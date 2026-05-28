// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface OpenQuestionVoteRecord {
  subject: string
  value: number
  voteNullifier?: string
  eligibilityProofRef?: string
  createdAt: string
}

type ParaOpenQuestionVote = Selectable<
  DatabaseSchemaType['para_open_question_vote']
>

const lexId = 'com.para.civic.openQuestionVote'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: OpenQuestionVoteRecord,
  timestamp: string,
): Promise<ParaOpenQuestionVote | null> => {
  if (!Number.isInteger(obj.value) || obj.value < -1 || obj.value > 1) {
    return null
  }

  const row = {
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

  const existing = row.voteNullifier
    ? await db
        .selectFrom('para_open_question_vote')
        .where('subject', '=', row.subject)
        .where('voteNullifier', '=', row.voteNullifier)
        .select(['uri'])
        .executeTakeFirst()
    : await db
        .selectFrom('para_open_question_vote')
        .where('creator', '=', row.creator)
        .where('subject', '=', row.subject)
        .select(['uri'])
        .executeTakeFirst()

  const inserted = existing
    ? await db
        .updateTable('para_open_question_vote')
        .set(row)
        .where('uri', '=', existing.uri)
        .returningAll()
        .executeTakeFirst()
    : await db
        .insertInto('para_open_question_vote')
        .values(row)
        .returningAll()
        .executeTakeFirst()

  return inserted ?? null
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

const notifsForInsert = () => []

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<ParaOpenQuestionVote | null> => {
  const deleted = await db
    .deleteFrom('para_open_question_vote')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()

  return deleted ?? null
}

const notifsForDelete = () => ({ notifs: [], toDelete: [] })

export type PluginType = RecordProcessor<
  OpenQuestionVoteRecord,
  ParaOpenQuestionVote
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
