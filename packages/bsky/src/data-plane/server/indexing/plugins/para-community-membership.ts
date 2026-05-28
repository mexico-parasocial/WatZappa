// @ts-nocheck
import { Selectable, sql } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
// eslint-disable-next-line import/no-unresolved
import { ParaCacheService } from '../../../cache/para-cache.js'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface ParaCommunityMembershipRecord {
  community: string
  membershipState: 'pending' | 'active' | 'left' | 'removed' | 'blocked'
  roles?: string[]
  roleAssignments?: Array<Record<string, unknown>>
  source?: string
  joinedAt: string
  leftAt?: string
}

type IndexedParaCommunityMembership = Selectable<
  DatabaseSchemaType['para_community_membership']
>

const lexId = 'com.para.community.membership'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: ParaCommunityMembershipRecord,
  timestamp: string,
): Promise<IndexedParaCommunityMembership | null> => {
  const inserted = await db
    .insertInto('para_community_membership')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      communityUri: obj.community,
      membershipState: obj.membershipState,
      roles: obj.roles?.length
        ? sql<string[]>`${JSON.stringify(obj.roles)}`
        : null,
      roleAssignments: obj.roleAssignments?.length
        ? sql<Record<string, unknown>[]>`${JSON.stringify(obj.roleAssignments)}`
        : null,
      source: obj.source ?? null,
      joinedAt: normalizeDatetimeAlways(obj.joinedAt),
      leftAt: obj.leftAt ? normalizeDatetimeAlways(obj.leftAt) : null,
      indexedAt: timestamp,
    })
    .onConflict((oc) => oc.doNothing())
    .returningAll()
    .executeTakeFirst()

  return inserted ?? null
}

const findDuplicate = async (
  db: DatabaseSchema,
  uri: AtUri,
  obj: ParaCommunityMembershipRecord,
): Promise<AtUri | null> => {
  const found = await db
    .selectFrom('para_community_membership')
    .where('creator', '=', uri.host)
    .where('communityUri', '=', obj.community)
    .select('uri')
    .executeTakeFirst()

  return found ? new AtUri(found.uri) : null
}

const notifsForInsert = () => {
  return []
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedParaCommunityMembership | null> => {
  const deleted = await db
    .deleteFrom('para_community_membership')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = () => {
  return { notifs: [], toDelete: [] }
}

const invalidateCache = async (
  _db: DatabaseSchema,
  indexed: IndexedParaCommunityMembership,
): Promise<string[]> => {
  const keys: string[] = []
  // Invalidate all members queries for this community
  keys.push(`members:${indexed.communityUri}:*`)
  // Invalidate profile stats for the member
  keys.push(`profileStats:${indexed.creator}`)
  return keys
}

export type PluginType = RecordProcessor<
  ParaCommunityMembershipRecord,
  IndexedParaCommunityMembership
>

export const makePlugin = (
  db: Database,
  background: BackgroundQueue,
  paraCache?: ParaCacheService,
): PluginType => {
  return new RecordProcessor(
    db,
    background,
    {
      lexId,
      insertFn,
      findDuplicate,
      deleteFn,
      notifsForInsert,
      notifsForDelete,
      invalidateCache: paraCache ? invalidateCache : undefined,
    },
    paraCache,
  )
}

export default makePlugin
