import type { Selectable } from 'kysely'
import type { Cid, l } from '@atproto/lex-schema'
import type { AtUri } from '@atproto/syntax'
import { com } from '../../../../lexicons/index.js'
import type { BackgroundQueue } from '../../background.js'
import {
  type ChainDeps,
  advanceCommunityChain,
  refoldCommunityChain,
} from '../../community-chain.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

const schema = com.para.community.event.main
type EventSchema = typeof schema
type EventRecord = l.InferInput<EventSchema>
type IndexedEvent = Selectable<DatabaseSchemaType['para_community_chain_event']>

/**
 * OD-9 community chain events. Every event is stored, then the community's
 * chain is advanced as far as it can go (`advanceCommunityChain`). A deleted
 * or rewritten event, or a second event for a seq, folds the community
 * again, so it freezes just before that event whatever was applied already.
 */
function makeFns(deps: ChainDeps) {
  const insertFn = async (
    db: DatabaseSchema,
    uri: AtUri,
    cid: Cid,
    event: EventRecord,
    timestamp: string,
  ): Promise<IndexedEvent | null> => {
    const database = { db } as Database
    const community = uri.host
    const existing = await db
      .selectFrom('para_community_chain_event')
      .selectAll()
      .where('uri', '=', uri.toString())
      .executeTakeFirst()
    if (existing) {
      if (existing.cid !== cid.toString() && !existing.tampered) {
        await markTampered(database, deps, existing, 'rewritten', timestamp)
      } else {
        await advanceCommunityChain(database, deps, community, timestamp)
      }
      return existing
    }
    const inserted = await db
      .insertInto('para_community_chain_event')
      .values({
        uri: uri.toString(),
        cid: cid.toString(),
        community,
        seq: event.seq,
        prev: event.prev ?? null,
        action: event.action,
        actor: event.actor,
        subject: event.subject,
        offer: event.offer ?? null,
        expiresAt: event.expiresAt ?? null,
        sanction: event.sanction ?? null,
        target: event.target ?? null,
        targetCid: event.targetCid ?? null,
        profile: event.profile ? JSON.stringify(event.profile) : null,
        governanceMode: event.governanceMode ?? null,
        admissionMode: event.admissionMode ?? null,
        requestUri: event.request.uri,
        requestCid: event.request.cid,
        requestProof: event.requestProof,
        createdAt: event.createdAt,
        indexedAt: timestamp,
      })
      .returningAll()
      .executeTakeFirstOrThrow()
    // A second event for a seq already folded is a fork found late: fold
    // again, so the community freezes just as a rebuild would leave it.
    const rival = await db
      .selectFrom('para_community_chain_event')
      .select('uri')
      .where('community', '=', community)
      .where('seq', '=', event.seq)
      .where('uri', '!=', inserted.uri)
      .executeTakeFirst()
    if (rival) {
      await refoldCommunityChain(database, deps, community, timestamp)
    } else {
      await advanceCommunityChain(database, deps, community, timestamp)
    }
    return inserted
  }

  const deleteFn = async (
    db: DatabaseSchema,
    uri: AtUri,
  ): Promise<IndexedEvent | null> => {
    const existing = await db
      .selectFrom('para_community_chain_event')
      .selectAll()
      .where('uri', '=', uri.toString())
      .executeTakeFirst()
    if (!existing) return null
    if (!existing.tampered) {
      await markTampered(
        { db } as Database,
        deps,
        existing,
        'deleted',
        new Date().toISOString(),
      )
    }
    return existing
  }

  return { insertFn, deleteFn }
}

async function markTampered(
  db: Database,
  deps: ChainDeps,
  event: IndexedEvent,
  how: 'deleted' | 'rewritten',
  timestamp: string,
) {
  await db.db
    .updateTable('para_community_chain_event')
    .set({ tampered: how })
    .where('uri', '=', event.uri)
    .execute()
  await refoldCommunityChain(db, deps, event.community, timestamp)
}

export type PluginType = RecordProcessor<EventSchema, IndexedEvent>

export function makePlugin(
  db: Database,
  background: BackgroundQueue,
  deps: ChainDeps,
): PluginType {
  const { insertFn, deleteFn } = makeFns(deps)
  return new RecordProcessor(db, background, {
    schema,
    insertFn,
    findDuplicate: async () => null,
    deleteFn,
    notifsForInsert: () => [],
    notifsForDelete: () => ({ notifs: [], toDelete: [] }),
  })
}
