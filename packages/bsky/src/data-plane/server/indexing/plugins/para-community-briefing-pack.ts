// @ts-nocheck
import { Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

interface ParaCommunityBriefingPackRecord {
  packType: 'party_lobbying'
  communityUri: string
  party: string
  title: string
  summary: string
  cabildeoUris: string[]
  civicTreeCardIds: string[]
  evidenceUris: string[]
  sembleCollectionUri?: string
  marginCollectionUri?: string
  obsidianExportUri?: string
  status: 'draft' | 'published' | 'archived'
  createdBy: string
  createdAt: string
  updatedAt: string
}

type IndexedBriefingPack = Selectable<
  DatabaseSchemaType['para_community_briefing_pack']
>

const lexId = 'com.para.community.briefingPack'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ParaCommunityBriefingPackRecord,
  timestamp: string,
): Promise<IndexedBriefingPack | null> => {
  const inserted = await db
    .insertInto('para_community_briefing_pack')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      rkey: uri.rkey,
      packType: obj.packType,
      communityUri: obj.communityUri,
      party: obj.party,
      title: obj.title,
      summary: obj.summary,
      cabildeoUris: sql<string[]>`${JSON.stringify(obj.cabildeoUris ?? [])}`,
      civicTreeCardIds: sql<string[]>`${JSON.stringify(
        obj.civicTreeCardIds ?? [],
      )}`,
      evidenceUris: sql<string[]>`${JSON.stringify(obj.evidenceUris ?? [])}`,
      sembleCollectionUri: obj.sembleCollectionUri ?? null,
      marginCollectionUri: obj.marginCollectionUri ?? null,
      obsidianExportUri: obj.obsidianExportUri ?? null,
      status: obj.status,
      createdBy: obj.createdBy,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      updatedAt: normalizeDatetimeAlways(obj.updatedAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => null

const notifsForInsert = () => []

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedBriefingPack | null> => {
  const deleted = await db
    .deleteFrom('para_community_briefing_pack')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = () => ({ notifs: [], toDelete: [] })

export type PluginType = RecordProcessor<
  ParaCommunityBriefingPackRecord,
  IndexedBriefingPack
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
