// @ts-nocheck
import { CID } from 'multiformats/cid'
import { AtUri } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

type GovernanceRecord = Record<string, unknown>

const lexId = 'com.para.community.governance'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: GovernanceRecord,
  timestamp: string,
): Promise<GovernanceRecord> => {
  const metadata = obj.metadata as Record<string, any> | undefined
  await db
    .insertInto('para_community_governance')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      communityUri: (obj.community as string) || '',
      state: metadata?.state || null,
      matterFlairIds: metadata?.matterFlairIds
        ? JSON.stringify(metadata.matterFlairIds)
        : null,
      policyFlairIds: metadata?.policyFlairIds
        ? JSON.stringify(metadata.policyFlairIds)
        : null,
      moderatorCount: Array.isArray(obj.moderators) ? obj.moderators.length : 0,
      officialCount: Array.isArray(obj.officials) ? obj.officials.length : 0,
      deputyRoleCount: Array.isArray(obj.deputies) ? obj.deputies.length : 0,
      lastPublishedAt:
        (metadata?.lastPublishedAt as string) ||
        (obj.updatedAt as string) ||
        null,
      indexedAt: timestamp,
    })
    .onConflict((oc) =>
      oc.column('uri').doUpdateSet({
        cid: cid.toString(),
        communityUri: (obj.community as string) || '',
        state: metadata?.state || null,
        matterFlairIds: metadata?.matterFlairIds
          ? JSON.stringify(metadata.matterFlairIds)
          : null,
        policyFlairIds: metadata?.policyFlairIds
          ? JSON.stringify(metadata.policyFlairIds)
          : null,
        moderatorCount: Array.isArray(obj.moderators)
          ? obj.moderators.length
          : 0,
        officialCount: Array.isArray(obj.officials) ? obj.officials.length : 0,
        deputyRoleCount: Array.isArray(obj.deputies) ? obj.deputies.length : 0,
        lastPublishedAt:
          (metadata?.lastPublishedAt as string) ||
          (obj.updatedAt as string) ||
          null,
        indexedAt: timestamp,
      }),
    )
    .execute()
  return obj
}

const findDuplicate = async (
  db: DatabaseSchema,
  uri: AtUri,
  obj: GovernanceRecord,
): Promise<AtUri | null> => {
  const found = await db
    .selectFrom('para_community_governance')
    .select('uri')
    .where('communityUri', '=', (obj.community as string) || '')
    .where('uri', '!=', uri.toString())
    .executeTakeFirst()
  return found ? new AtUri(found.uri) : null
}

const deleteFn = async (
  db: DatabaseSchema,
  uri: AtUri,
): Promise<GovernanceRecord | null> => {
  const found = await db
    .selectFrom('para_community_governance')
    .selectAll()
    .where('uri', '=', uri.toString())
    .executeTakeFirst()
  if (found) {
    await db
      .deleteFrom('para_community_governance')
      .where('uri', '=', uri.toString())
      .execute()
  }
  return null
}

const notifsForInsert = () => []

const notifsForDelete = () => ({ notifs: [], toDelete: [] })

export type PluginType = RecordProcessor<GovernanceRecord, GovernanceRecord>

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
