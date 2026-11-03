import { createHash } from 'node:crypto'
import type { Insertable, Selectable } from 'kysely'
import type { Cid } from '@atproto/lex-data'
import type { l } from '@atproto/lex-schema'
import { type AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import {
  type ParaFollowThrough,
  type ParaFollowThroughUpdate,
  followThroughCommitTableName,
  followThroughTableName,
  followThroughUpdateTableName,
} from '../../db/tables/para-follow-through.js'
import { isFollowStatus } from '../../follow-through.js'
import { RecordProcessor } from '../processor.js'

/*
 * Compromisos and their updates are written to each steward's own repo. They
 * are indexed here whoever wrote them; whether the author may speak for the
 * cabildeo's community is decided when they are read
 * (data-plane/server/routes/follow-through.ts), so a role granted or revoked
 * later takes effect without re-indexing.
 *
 * The first version of every record is kept in `para_follow_through_commit`.
 * An edit is indexed as the committed version flagged `edited`, so history is
 * append-only even though a repo record can be rewritten.
 */

type LexId = l.RecordSchema['$type']

const ITEM: LexId = 'com.para.civic.followThrough'
const UPDATE: LexId = 'com.para.civic.followThroughUpdate'

const MAX_EVIDENCE = 5

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= max
    ? value
    : undefined
const isAtUri = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('at://')
const datetime = (value: unknown): string | undefined => {
  const raw = str(value, 64)
  return raw && Number.isFinite(Date.parse(raw))
    ? normalizeDatetimeAlways(raw)
    : undefined
}

const digestOf = (committed: Json) =>
  createHash('sha256').update(JSON.stringify(committed)).digest('hex')

/**
 * The first version wins. Returns the committed fields to serve, whether the
 * incoming record differs from them, and when the first version was indexed.
 */
const commit = async <T extends Json>(
  db: DatabaseSchema,
  uri: AtUri,
  kind: 'item' | 'update',
  subject: string,
  incoming: T,
  timestamp: string,
): Promise<{ committed: T; edited: boolean; firstIndexedAt: string }> => {
  const digest = digestOf(incoming)
  const inserted = await db
    .insertInto(followThroughCommitTableName)
    .values({
      uri: uri.toString(),
      kind,
      subject,
      creator: uri.host,
      digest,
      json: JSON.stringify(incoming),
      indexedAt: timestamp,
    })
    .onConflict((oc) => oc.doNothing())
    .returning('uri')
    .executeTakeFirst()
  if (inserted) {
    return { committed: incoming, edited: false, firstIndexedAt: timestamp }
  }
  const existing = await db
    .selectFrom(followThroughCommitTableName)
    .where('uri', '=', uri.toString())
    .select(['digest', 'json', 'indexedAt'])
    .executeTakeFirstOrThrow()
  return {
    committed: JSON.parse(existing.json) as T,
    edited: existing.digest !== digest,
    firstIndexedAt: existing.indexedAt,
  }
}

/**
 * A record's own `createdAt` is a claim. It is committed with the first
 * version, so an edit cannot move it, and served no later than the time that
 * version was indexed, so a record cannot claim a future date to sort first.
 * The digest covers the claim as written, not the clamped value, so
 * re-indexing an unchanged record later does not read as an edit.
 */
const sortableCreatedAt = (
  claimed: string | null | undefined,
  firstIndexedAt: string,
) =>
  claimed && Date.parse(claimed) < Date.parse(firstIndexedAt)
    ? claimed
    : firstIndexedAt

// Items -----------------------------------------------------------------------

type ItemFields = {
  cabildeo: string
  communityUri: string
  optionIndex: number
  parent: string | null
  title: string
  responsibleDid: string | null
  responsibleLabel: string | null
  dueAt: string | null
  createdAt: string | null
}

const insertItem = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  obj: unknown,
  timestamp: string,
): Promise<Selectable<ParaFollowThrough> | null> => {
  if (!isObject(obj) || !isAtUri(obj.cabildeo) || !isAtUri(obj.communityUri)) {
    return null
  }
  const title = str(obj.title, 300)
  const optionIndex = obj.optionIndex
  if (
    !title ||
    typeof optionIndex !== 'number' ||
    !Number.isSafeInteger(optionIndex) ||
    optionIndex < 0
  ) {
    return null
  }
  if (obj.parent !== undefined && !isAtUri(obj.parent)) return null
  if (obj.parent === uri.toString()) return null
  const summary = str(obj.summary, 2000)
  const responsibleDid = str(obj.responsibleDid, 256)
  const incoming: ItemFields = {
    cabildeo: obj.cabildeo,
    communityUri: obj.communityUri,
    optionIndex,
    parent: (obj.parent as string | undefined) ?? null,
    title,
    responsibleDid: responsibleDid?.startsWith('did:') ? responsibleDid : null,
    responsibleLabel: str(obj.responsibleLabel, 200) ?? null,
    dueAt: datetime(obj.dueAt) ?? null,
    createdAt: datetime(obj.createdAt) ?? null,
  }
  const { committed, edited, firstIndexedAt } = await commit(
    db,
    uri,
    'item',
    incoming.cabildeo,
    incoming,
    timestamp,
  )
  const values: Insertable<ParaFollowThrough> = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    ...committed,
    summary: summary ?? null,
    edited,
    createdAt: sortableCreatedAt(committed.createdAt, firstIndexedAt),
    indexedAt: timestamp,
  }
  return (
    (await db
      .insertInto(followThroughTableName)
      .values(values)
      .onConflict((oc) => oc.doNothing())
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

// Updates ---------------------------------------------------------------------

type UpdateFields = {
  subject: string
  status: string
  progress: number | null
  note: string | null
  evidenceUris: string[]
  dueAt: string | null
  occurredAt: string
  createdAt: string | null
}

const insertUpdate = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  obj: unknown,
  timestamp: string,
): Promise<Selectable<ParaFollowThroughUpdate> | null> => {
  if (!isObject(obj) || !isAtUri(obj.subject) || !isFollowStatus(obj.status)) {
    return null
  }
  const occurredAt = datetime(obj.occurredAt)
  if (!occurredAt) return null
  let progress: number | null = null
  if (obj.progress !== undefined) {
    if (
      typeof obj.progress !== 'number' ||
      !Number.isInteger(obj.progress) ||
      obj.progress < 0 ||
      obj.progress > 100
    ) {
      return null
    }
    progress = obj.progress
  }
  const note = str(obj.note, 2000) ?? null
  const dueAt = datetime(obj.dueAt) ?? null
  // A reschedule, a block and an abandonment each have to say why.
  if (
    note === null &&
    (dueAt !== null || obj.status === 'blocked' || obj.status === 'abandoned')
  ) {
    return null
  }
  let evidenceUris: string[] = []
  if (obj.evidenceUris !== undefined) {
    if (
      !Array.isArray(obj.evidenceUris) ||
      obj.evidenceUris.length > MAX_EVIDENCE
    ) {
      return null
    }
    evidenceUris = obj.evidenceUris.filter(
      (value): value is string =>
        typeof value === 'string' &&
        value.length <= 1000 &&
        /^https?:\/\//.test(value),
    )
    if (evidenceUris.length !== obj.evidenceUris.length) return null
  }
  const incoming: UpdateFields = {
    subject: obj.subject,
    status: obj.status,
    progress,
    note,
    evidenceUris,
    dueAt,
    occurredAt,
    createdAt: datetime(obj.createdAt) ?? null,
  }
  const { committed, edited, firstIndexedAt } = await commit(
    db,
    uri,
    'update',
    incoming.subject,
    incoming,
    timestamp,
  )
  const values: Insertable<ParaFollowThroughUpdate> = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    subject: committed.subject,
    status: committed.status,
    progress: committed.progress,
    note: committed.note,
    evidenceUris: JSON.stringify(committed.evidenceUris),
    dueAt: committed.dueAt,
    edited,
    occurredAt: committed.occurredAt,
    createdAt: sortableCreatedAt(committed.createdAt, firstIndexedAt),
    indexedAt: timestamp,
  }
  return (
    (await db
      .insertInto(followThroughUpdateTableName)
      .values(values)
      .onConflict((oc) => oc.doNothing())
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

// Plugins ---------------------------------------------------------------------

const noNotifs = () => []
const noDeleteNotifs = () => ({ notifs: [], toDelete: [] })
const noDuplicates = async () => null

// @NOTE the commit row is deliberately left behind on delete: it is how a
// withdrawn update is told apart from one that never existed.
const deleteByUri =
  <T extends keyof DatabaseSchemaType>(table: T) =>
  async (db: DatabaseSchema, uri: AtUri) =>
    ((await db
      .deleteFrom(table as any)
      .where('uri' as any, '=', uri.toString())
      .returningAll()
      .executeTakeFirst()) ?? null) as Selectable<DatabaseSchemaType[T]> | null

export type FollowThroughPluginType = RecordProcessor<
  l.RecordSchema,
  Selectable<ParaFollowThrough>
>
export type FollowThroughUpdatePluginType = RecordProcessor<
  l.RecordSchema,
  Selectable<ParaFollowThroughUpdate>
>

export const makeItemPlugin = (
  db: Database,
  background: BackgroundQueue,
): FollowThroughPluginType =>
  new RecordProcessor(db, background, {
    lexId: ITEM,
    insertFn: insertItem,
    findDuplicate: noDuplicates,
    deleteFn: deleteByUri(followThroughTableName),
    notifsForInsert: noNotifs,
    notifsForDelete: noDeleteNotifs,
  })

export const makeUpdatePlugin = (
  db: Database,
  background: BackgroundQueue,
): FollowThroughUpdatePluginType =>
  new RecordProcessor(db, background, {
    lexId: UPDATE,
    insertFn: insertUpdate,
    findDuplicate: noDuplicates,
    deleteFn: deleteByUri(followThroughUpdateTableName),
    notifsForInsert: noNotifs,
    notifsForDelete: noDeleteNotifs,
  })
