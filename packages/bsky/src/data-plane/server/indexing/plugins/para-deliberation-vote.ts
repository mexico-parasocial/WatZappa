// @ts-nocheck
import type { Selectable } from 'kysely'
import type { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

interface DeliberationVoteRecord {
  deliberation: string
  voter: string
  direction: string
  voteNullifier?: string
  eligibilityProofRef?: string
  createdAt: string
}

type ParaDeliberationVote = Selectable<
  DatabaseSchemaType['para_deliberation_vote']
>

const lexId = 'com.para.community.deliberationVote'

// What a reaction may be about: an argument in a cabildeo, which is a position.
const REACTION_SUBJECTS: ReadonlySet<string> = new Set([
  'com.para.civic.position',
])

const isReactionSubject = (subject: unknown): boolean => {
  if (typeof subject !== 'string') return false
  try {
    return REACTION_SUBJECTS.has(new AtUri(subject).collection)
  } catch {
    return false
  }
}

const normalizeOpaqueProofField = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) return null
  return trimmed
}

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: DeliberationVoteRecord,
  timestamp: string,
): Promise<ParaDeliberationVote | null> => {
  // @NOTE a remote repository may name any voter in its payload.
  if (obj.voter !== uri.host) return null
  if (!isReactionSubject(obj.deliberation)) return null

  const record = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    statement: obj.deliberation,
    direction: obj.direction,
    voteNullifier: normalizeOpaqueProofField(obj.voteNullifier, 128),
    eligibilityProofRef: normalizeOpaqueProofField(
      obj.eligibilityProofRef,
      512,
    ),
    createdAt: normalizeDatetimeAlways(obj.createdAt),
    indexedAt: timestamp,
  }

  // Changing your mind about an argument replaces your earlier position rather
  // than adding another: by nullifier when m8 issued one, by author otherwise.
  const existing = record.voteNullifier
    ? await db
        .selectFrom('para_deliberation_vote')
        .where('statement', '=', record.statement)
        .where('voteNullifier', '=', record.voteNullifier)
        .select(['uri'])
        .executeTakeFirst()
    : await db
        .selectFrom('para_deliberation_vote')
        .where('statement', '=', record.statement)
        .where('creator', '=', record.creator)
        .select(['uri'])
        .executeTakeFirst()

  const inserted = existing
    ? await db
        .updateTable('para_deliberation_vote')
        .set(record)
        .where('uri', '=', existing.uri)
        .returningAll()
        .executeTakeFirst()
    : await db
        .insertInto('para_deliberation_vote')
        .values(record)
        .returningAll()
        .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => null

const notifsForInsert = () => []

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<ParaDeliberationVote | null> => {
  const deleted = await db
    .deleteFrom('para_deliberation_vote')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = (deleted: ParaDeliberationVote) => {
  return { notifs: [], toDelete: [deleted.uri] }
}

export type PluginType = RecordProcessor<
  DeliberationVoteRecord,
  ParaDeliberationVote
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
