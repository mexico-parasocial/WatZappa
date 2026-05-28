// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface ParaCommunityBoardRecord {
  name: string
  description?: string
  quadrant: string
  delegatesChatId: string
  subdelegatesChatId: string
  governanceMode?: string
  createdAt: string
}

type IndexedParaCommunityBoard = Selectable<
  DatabaseSchemaType['para_community_board']
>

const lexId = 'com.para.community.board'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ParaCommunityBoardRecord,
  timestamp: string,
): Promise<IndexedParaCommunityBoard | null> => {
  const inserted = await db
    .insertInto('para_community_board')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      rkey: uri.rkey,
      name: obj.name,
      description: obj.description ?? null,
      quadrant: obj.quadrant,
      slug: deriveBoardSlug(uri, obj.name),
      delegatesChatId: obj.delegatesChatId,
      subdelegatesChatId: obj.subdelegatesChatId,
      governanceMode: obj.governanceMode ?? 'hierarchical',
      createdAt: normalizeDatetimeAlways(obj.createdAt),
      indexedAt: timestamp,
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (): Promise<AtUri | null> => {
  return null
}

const notifsForInsert = () => {
  return []
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedParaCommunityBoard | null> => {
  const deleted = await db
    .deleteFrom('para_community_board')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = () => {
  return { notifs: [], toDelete: [] }
}

export type PluginType = RecordProcessor<
  ParaCommunityBoardRecord,
  IndexedParaCommunityBoard
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

function deriveBoardSlug(uri: AtUri, name: string) {
  const base = normalizeSlug(name)
  return base ? `${base}-${uri.rkey}` : `community-${uri.rkey}`
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default makePlugin
