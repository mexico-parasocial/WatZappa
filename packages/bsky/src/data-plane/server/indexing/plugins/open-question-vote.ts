import { Selectable, sql } from 'kysely'
import { Cid } from '@atproto/lex'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { com } from '../../../../lexicons.js'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

type ParaOpenQuestionVote = Selectable<
  DatabaseSchemaType['para_open_question_vote']
>

const lexId = 'com.para.civic.openQuestionVote'

const normalizeOpaqueProofField = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

// One row is shared by every record carrying a given vote nullifier
// (multi-identity dedup), so the row may be keyed by another record's uri.
const findVoteByNullifier = (
  db: DatabaseSchema,
  subject: string,
  voteNullifier: string,
) =>
  db
    .selectFrom('para_open_question_vote')
    .where('subject', '=', subject)
    .where('voteNullifier', '=', voteNullifier)
    .select(['uri'])
    .executeTakeFirst()

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  obj: com.para.civic.openQuestionVote.Main,
  timestamp: string,
): Promise<ParaOpenQuestionVote | null> => {
  if (!Number.isInteger(obj.value) || obj.value < -1 || obj.value > 1) {
    return null
  }

  const record = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    subject: obj.subject,
    value: obj.value,
    voteNullifier: normalizeOpaqueProofField(obj.voteNullifier, 128),
    eligibilityProofRef: normalizeOpaqueProofField(
      obj.eligibilityProofRef,
      512,
    ),
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    indexedAt: timestamp,
  }

  // Fast path: this uri/nullifier combination is new.
  const inserted = await db
    .insertInto('para_open_question_vote')
    .values(record)
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()
  if (inserted) return inserted

  // A vote already exists for this nullifier (or creator+subject). Fold this
  // vote into that row, keeping its uri — other records may reference it, and
  // rewriting the primary key would orphan them.
  const existing = record.voteNullifier
    ? await findVoteByNullifier(db, record.subject, record.voteNullifier)
    : await db
        .selectFrom('para_open_question_vote')
        .where('creator', '=', record.creator)
        .where('subject', '=', record.subject)
        .select(['uri'])
        .executeTakeFirst()
  if (!existing) return null

  const { uri: _uri, ...updates } = record
  const updated = await db
    .updateTable('para_open_question_vote')
    .set(updates)
    .where('uri', '=', existing.uri)
    .returningAll()
    .executeTakeFirst()
  return updated ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<ParaOpenQuestionVote | null> => {
  const row = await db
    .selectFrom('para_open_question_vote')
    .where('uri', '=', uri.toString())
    .select(['uri', 'voteNullifier'])
    .executeTakeFirst()
  if (!row) return null

  if (row.voteNullifier) {
    // Another live record still carries this nullifier: hand the shared row
    // to that record instead of deleting, so the vote outlives the removal
    // of any single identity's record. (The processor has already deleted
    // this uri's own record row by the time deleteFn runs.)
    const heir = await db
      .selectFrom('record')
      .where(
        sql<boolean>`"json"::jsonb ->> 'voteNullifier' = ${row.voteNullifier} and "uri" like ${`at://%/${lexId}/%`}`,
      )
      .select('uri')
      .executeTakeFirst()
    if (heir) {
      const updated = await db
        .updateTable('para_open_question_vote')
        .set({ uri: heir.uri })
        .where('uri', '=', uri.toString())
        .returningAll()
        .executeTakeFirst()
      return updated ?? null
    }
  }

  const deleted = await db
    .deleteFrom('para_open_question_vote')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForInsert = () => []

const notifsForDelete = () => ({ notifs: [], toDelete: [] })

export type PluginType = ReturnType<typeof makePlugin>

export const makePlugin = (db: Database, background: BackgroundQueue) => {
  return new RecordProcessor(db, background, {
    schema: com.para.civic.openQuestionVote.main,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert,
    notifsForDelete,
  })
}

export default makePlugin
