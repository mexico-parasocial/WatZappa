// @ts-nocheck
import { type Selectable, sql } from 'kysely'
import type { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import type { ParaCacheService } from '../../../../cache/para-cache.js'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'
import { finalizeDueCabildeos } from './finalize-cabildeos.js'
import { recomputeCabildeoAggregates } from './recompute-cabildeo-aggregates.js'

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
  await finalizeDueCabildeos(db)
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
  await finalizeDueCabildeos(db)
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

const updateAggregates = async (
  db: DatabaseSchema,
  membership: IndexedParaCommunityMembership,
) => {
  const grant = await db
    .selectFrom('cabildeo_delegation')
    .where('creator', '=', membership.creator)
    .select('uri')
    .limit(1)
    .executeTakeFirst()
  if (!grant) return
  const open = await db
    .selectFrom('cabildeo_cabildeo')
    .where('phase', '=', 'voting')
    .select('uri')
    .execute()
  for (const row of open) await recomputeCabildeoAggregates(db, row.uri)
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
      updateAggregates,
      invalidateCache: paraCache ? invalidateCache : undefined,
    },
    paraCache,
  )
}

export default makePlugin
