// @ts-nocheck
import { Selectable } from 'kysely'
import { CID } from 'multiformats/cid'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { BackgroundQueue } from '../../background.js'
import { Database } from '../../db/index.js'
import { DatabaseSchema, DatabaseSchemaType } from '../../db/database-schema.js'
import { RecordProcessor } from '../processor.js'

interface DelegationRecord {
  delegate: string
  delegator: string
  delegateRole?: string
  party?: string
  scope: {
    mode: string
    community?: string
    topic?: string
    proposal?: string
  }
  expiresAt?: string
  revokedAt?: string
  createdAt: string
}

type ParaQvldDelegation = Selectable<DatabaseSchemaType['para_qvld_delegation']>

const lexId = 'com.para.community.delegation'

const insertFn = async (
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  obj: DelegationRecord,
  timestamp: string,
): Promise<ParaQvldDelegation | null> => {
  const inserted = await db
    .insertInto('para_qvld_delegation')
    .values({
      uri: uri.toString(),
      cid: cid.toString(),
      creator: uri.host,
      delegate: obj.delegate,
      delegator: obj.delegator,
      delegateRole: obj.delegateRole ?? null,
      party: obj.party ?? null,
      scopeMode: obj.scope.mode,
      scopeCommunity: obj.scope.community ?? null,
      scopeTopic: obj.scope.topic ?? null,
      scopeProposal: obj.scope.proposal ?? null,
      expiresAt: obj.expiresAt ?? null,
      revokedAt: obj.revokedAt ?? null,
      createdAt: normalizeDatetimeAlways(obj.createdAt),
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
): Promise<ParaQvldDelegation | null> => {
  const deleted = await db
    .deleteFrom('para_qvld_delegation')
    .where('uri', '=', uri.toString())
    .returningAll()
    .executeTakeFirst()
  return deleted ?? null
}

const notifsForDelete = (deleted: ParaQvldDelegation) => {
  return { notifs: [], toDelete: [deleted.uri] }
}

export type PluginType = RecordProcessor<DelegationRecord, ParaQvldDelegation>

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
