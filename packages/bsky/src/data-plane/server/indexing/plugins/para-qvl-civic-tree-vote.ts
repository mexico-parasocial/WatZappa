// @ts-nocheck
import { Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface CivicTreeVoteRecord {
  civicTree: string
  voter: string
  direction: string
  voteNullifier?: string
  eligibilityProofRef?: string
  createdAt: string
}

type ParaQvldCivicTreeVote = Selectable<
  DatabaseSchemaType['para_qvld_civicTree_vote']
>

const lexId = 'com.para.community.civicTreeVote'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: CivicTreeVoteRecord,
  timestamp: string,
): Promise<ParaQvldCivicTreeVote | null> => {
  const record = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    statement: obj.civicTree,
    voter: obj.voter,
    vote: obj.direction,
    voteNullifier: normalizeOpaqueProofField(obj.voteNullifier, 128),
    eligibilityProofRef: normalizeOpaqueProofField(obj.eligibilityProofRef, 512),
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    indexedAt: timestamp,
  }

  const existing = record.voteNullifier
    ? await db
        .selectFrom('para_qvld_civicTree_vote')
        .where('statement', '=', record.statement)
        .where('voteNullifier', '=', record.voteNullifier)
        .select(['uri'])
        .executeTakeFirst()
    : await db
        .selectFrom('para_qvld_civicTree_vote')
        .where('creator', '=', record.creator)
        .where('statement', '=', record.statement)
        .select(['uri'])
        .executeTakeFirst()

  const inserted = existing
    ? await db
        .updateTable('para_qvld_civicTree_vote')
        .set(record)
        .where('uri', '=', existing.uri)
        .returningAll()
        .executeTakeFirst()
    : await db
        .insertInto('para_qvld_civicTree_vote')
        .values(record)
        .returningAll()
        .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => null

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
): Promise<ParaQvldCivicTreeVote | null> => {
  const deleted = await db
    .deleteFrom('para_qvld_civicTree_vote')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = (deleted: ParaQvldCivicTreeVote) => {
  return { notifs: [], toDelete: [deleted.uri] }
}

const recomputeStatementCounts = async (
  db: DatabaseSchema,
  statementUri: string,
) => {
  const counts = await db
    .selectFrom('para_qvld_civicTree_vote')
    .where('statement', '=', statementUri)
    .select([
      sql<number>`count(*) filter (where vote = 'agree')`.as('agree'),
      sql<number>`count(*) filter (where vote = 'disagree')`.as('disagree'),
      sql<number>`count(*) filter (where vote = 'pass')`.as('pass'),
    ])
    .executeTakeFirst()

  await db
    .updateTable('para_qvld_civicTree_statement')
    .set({
      agreeCount: Number(counts?.agree ?? 0),
      disagreeCount: Number(counts?.disagree ?? 0),
      passCount: Number(counts?.pass ?? 0),
    })
    .where('uri', '=', statementUri)
    .execute()
}

const updateAggregates = async (
  _db: DatabaseSchema,
  _obj: ParaQvldCivicTreeVote,
) => {
  // Aggregates are recomputed per-statement when votes are inserted/deleted.
  // This is triggered by the background queue after the vote transaction commits.
}

export type PluginType = RecordProcessor<
  CivicTreeVoteRecord,
  ParaQvldCivicTreeVote
>

export const makePlugin = (
  db: Database,
  background: BackgroundQueue,
): PluginType => {
  const plugin = new RecordProcessor(db, background, {
    lexId,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert,
    notifsForDelete,
    updateAggregates,
  })

  // Override insert/delete to recompute counts immediately after transaction
  const originalInsert = plugin.insertRecord.bind(plugin)
  const originalDelete = plugin.deleteRecord.bind(plugin)

  plugin.insertRecord = async (uri, cid, obj, timestamp, opts) => {
    const result = await originalInsert(uri, cid, obj, timestamp, opts)
    if (obj && typeof obj === 'object' && 'civicTree' in obj) {
      await recomputeStatementCounts(db.db, obj.civicTree)
    }
    return result
  }

  plugin.deleteRecord = async (uri, cascading) => {
    const vote = await db.db
      .selectFrom('para_qvld_civicTree_vote')
      .where('uri', '=', uri.toString())
      .select('statement')
      .executeTakeFirst()
    const result = await originalDelete(uri, cascading)
    if (vote) {
      await recomputeStatementCounts(db.db, vote.statement)
    }
    return result
  }

  return plugin
}
