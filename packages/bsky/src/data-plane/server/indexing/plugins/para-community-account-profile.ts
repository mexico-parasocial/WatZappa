import type { Selectable } from 'kysely'
import type { Cid, l } from '@atproto/lex-schema'
import type { AtUri } from '@atproto/syntax'
import { com } from '../../../../lexicons/index.js'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

const schema = com.para.community.profile.main
type ProfileSchema = typeof schema
type ProfileRecord = l.InferInput<ProfileSchema>
type IndexedAccount = Selectable<DatabaseSchemaType['para_community_account']>

/**
 * The presentation of an OD-9 community account. It grants nothing: a repo
 * is a community only once its chain holds a verified `community.found`.
 */
const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  profile: ProfileRecord,
  timestamp: string,
): Promise<IndexedAccount | null> => {
  if (uri.rkey !== 'self') return null
  const fields = {
    name: profile.name,
    description: profile.description ?? null,
    quadrant: profile.quadrant,
    region: profile.region ?? null,
    profileCid: cid.toString(),
    createdAt: profile.createdAt,
  }
  return db
    .insertInto('para_community_account')
    .values({ did: uri.host, indexedAt: timestamp, ...fields })
    .onConflict((oc) => oc.column('did').doUpdateSet(fields))
    .returningAll()
    .executeTakeFirstOrThrow()
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedAccount | null> => {
  if (uri.rkey !== 'self') return null
  return (
    (await db
      .updateTable('para_community_account')
      .set({
        name: null,
        description: null,
        quadrant: null,
        region: null,
        profileCid: null,
        createdAt: null,
      })
      .where('did', '=', uri.host)
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

export type PluginType = RecordProcessor<ProfileSchema, IndexedAccount>

export function makePlugin(
  db: Database,
  background: BackgroundQueue,
): PluginType {
  return new RecordProcessor(db, background, {
    schema,
    insertFn,
    findDuplicate: async () => null,
    deleteFn,
    notifsForInsert: () => [],
    notifsForDelete: () => ({ notifs: [], toDelete: [] }),
  })
}
