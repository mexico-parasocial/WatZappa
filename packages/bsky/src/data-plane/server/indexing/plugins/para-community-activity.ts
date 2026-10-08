import type { Insertable, Selectable } from 'kysely'
import type { Cid, l } from '@atproto/lex'
import { type AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import {
  type ParaCommunityActivity,
  type ParaCommunityLedgerEntry,
  type ParaCommunityWikiPage,
  activityTableName,
  ledgerEntryTableName,
  wikiPageTableName,
} from '../../db/tables/para-community-activity.js'
import { RecordProcessor } from '../processor.js'

/*
 * Community activities, their ledgers and wiki pages are written to each
 * organizer's own repo. They are indexed here whoever wrote them; whether the
 * author is one of the community's current organizers is decided when they
 * are read (data-plane/server/routes/community-activities.ts), so a role
 * granted or revoked later takes effect without re-indexing.
 */

type LexId = l.RecordSchema['$type']

const SOCIAL_ACTIVITY: LexId = 'com.para.community.socialActivity'
const ECONOMIC_ACTIVITY: LexId = 'com.para.community.economicActivity'
const LEDGER_ENTRY: LexId = 'com.para.community.activityLedgerEntry'
const WIKI_PAGE: LexId = 'com.para.community.wikiPage'

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (value: unknown, max = 3000): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= max
    ? value
    : undefined
const isAtUri = (value: unknown) =>
  typeof value === 'string' && value.startsWith('at://')
const datetime = (value: unknown): string | undefined => {
  const raw = str(value, 64)
  return raw && Number.isFinite(Date.parse(raw))
    ? normalizeDatetimeAlways(raw)
    : undefined
}

/** `com.para.community.socialActivity#peacefulMarch` → `peacefulMarch`. */
const detailsKind = (details: unknown, lexId: string): string | undefined => {
  if (!isObject(details)) return undefined
  const type = str(details.$type, 200)
  if (!type?.startsWith(`${lexId}#`)) return undefined
  return type.slice(lexId.length + 1) || undefined
}

const deleteByUri =
  <T extends keyof DatabaseSchemaType>(table: T) =>
  async (db: DatabaseSchema, uri: AtUri) =>
    ((await db
      .deleteFrom(table as any)
      .where('uri' as any, '=', uri.toString())
      .returningAll()
      .executeTakeFirst()) ?? null) as Selectable<DatabaseSchemaType[T]> | null

const noNotifs = () => []
const noDeleteNotifs = () => ({ notifs: [], toDelete: [] })
const noDuplicates = async () => null

// Activities -----------------------------------------------------------------

const insertActivity =
  (lexId: LexId, category: ParaCommunityActivity['category']) =>
  async (
    db: DatabaseSchema,
    uri: AtUri,
    cid: Cid,
    obj: unknown,
    timestamp: string,
  ): Promise<Selectable<ParaCommunityActivity> | null> => {
    if (!isObject(obj) || !isAtUri(obj.communityUri)) return null
    const title = str(obj.title, 300)
    const status = str(obj.status, 32)
    const startsAt = datetime(obj.startsAt)
    const kind = detailsKind(obj.details, lexId)
    if (!title || !status || !startsAt || !kind) return null
    if (category === 'economic' && !isObject(obj.financialPlan)) return null
    const values: Insertable<ParaCommunityActivity> = {
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      communityUri: obj.communityUri as string,
      category,
      kind,
      title,
      status,
      startsAt,
      endsAt: datetime(obj.endsAt) ?? null,
      json: JSON.stringify(obj),
      createdAt: datetime(obj.createdAt) ?? timestamp,
      indexedAt: timestamp,
    }
    return (
      (await db
        .insertInto(activityTableName)
        .values(values)
        .onConflict((oc) => oc.doNothing())
        .returningAll()
        .executeTakeFirst()) ?? null
    )
  }

export type ActivityPluginType = RecordProcessor<
  l.RecordSchema,
  Selectable<ParaCommunityActivity>
>

const makeActivityPlugin =
  (lexId: LexId, category: ParaCommunityActivity['category']) =>
  (db: Database, background: BackgroundQueue): ActivityPluginType =>
    new RecordProcessor(db, background, {
      lexId,
      insertFn: insertActivity(lexId, category),
      findDuplicate: noDuplicates,
      deleteFn: deleteByUri(activityTableName),
      notifsForInsert: noNotifs,
      notifsForDelete: noDeleteNotifs,
    })

export const makeSocialActivityPlugin = makeActivityPlugin(
  SOCIAL_ACTIVITY,
  'social',
)
export const makeEconomicActivityPlugin = makeActivityPlugin(
  ECONOMIC_ACTIVITY,
  'economic',
)

// Ledger entries -------------------------------------------------------------

const insertLedgerEntry = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  obj: unknown,
  timestamp: string,
): Promise<Selectable<ParaCommunityLedgerEntry> | null> => {
  if (
    !isObject(obj) ||
    !isAtUri(obj.activityUri) ||
    !isAtUri(obj.communityUri)
  ) {
    return null
  }
  const entryType = str(obj.entryType, 32)
  const currency = str(obj.currency, 8)
  const occurredAt = datetime(obj.occurredAt)
  const amountMinor = obj.amountMinor
  if (
    !entryType ||
    !currency ||
    !occurredAt ||
    typeof amountMinor !== 'number' ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0
  ) {
    return null
  }
  const values: Insertable<ParaCommunityLedgerEntry> = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    activityUri: obj.activityUri as string,
    communityUri: obj.communityUri as string,
    entryType,
    amountMinor,
    currency,
    occurredAt,
    json: JSON.stringify(obj),
    createdAt: datetime(obj.createdAt) ?? timestamp,
    indexedAt: timestamp,
  }
  return (
    (await db
      .insertInto(ledgerEntryTableName)
      .values(values)
      .onConflict((oc) => oc.doNothing())
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

export type LedgerEntryPluginType = RecordProcessor<
  l.RecordSchema,
  Selectable<ParaCommunityLedgerEntry>
>

export const makeLedgerEntryPlugin = (
  db: Database,
  background: BackgroundQueue,
): LedgerEntryPluginType =>
  new RecordProcessor(db, background, {
    lexId: LEDGER_ENTRY,
    insertFn: insertLedgerEntry,
    findDuplicate: noDuplicates,
    deleteFn: deleteByUri(ledgerEntryTableName),
    notifsForInsert: noNotifs,
    notifsForDelete: noDeleteNotifs,
  })

// Wiki pages -----------------------------------------------------------------

const insertWikiPage = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  obj: unknown,
  timestamp: string,
): Promise<Selectable<ParaCommunityWikiPage> | null> => {
  if (!isObject(obj) || !isAtUri(obj.communityUri)) return null
  const kind = str(obj.kind, 32)
  const slug = str(obj.slug, 128)
  const title = str(obj.title, 300)
  if (!kind || !slug || !title || typeof obj.body !== 'string') return null
  const values: Insertable<ParaCommunityWikiPage> = {
    uri: uri.toString(),
    cid: cid.toString(),
    creator: uri.host,
    communityUri: obj.communityUri as string,
    kind,
    slug,
    title,
    pinned: obj.pinned === true,
    sortOrder:
      typeof obj.sortOrder === 'number' && Number.isSafeInteger(obj.sortOrder)
        ? obj.sortOrder
        : null,
    json: JSON.stringify(obj),
    updatedAt: datetime(obj.updatedAt) ?? datetime(obj.createdAt) ?? timestamp,
    indexedAt: timestamp,
  }
  return (
    (await db
      .insertInto(wikiPageTableName)
      .values(values)
      .onConflict((oc) => oc.doNothing())
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

export type WikiPagePluginType = RecordProcessor<
  l.RecordSchema,
  Selectable<ParaCommunityWikiPage>
>

export const makeWikiPagePlugin = (
  db: Database,
  background: BackgroundQueue,
): WikiPagePluginType =>
  new RecordProcessor(db, background, {
    lexId: WIKI_PAGE,
    insertFn: insertWikiPage,
    findDuplicate: noDuplicates,
    deleteFn: deleteByUri(wikiPageTableName),
    notifsForInsert: noNotifs,
    notifsForDelete: noDeleteNotifs,
  })
