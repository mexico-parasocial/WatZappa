import { type Selectable } from 'kysely'
import type { CID } from 'multiformats/cid'
import {
  type AuthorityAction,
  type AuthorityBasis,
  AUTHORITY_EVENT_VERSION,
} from '@atproto/common'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { verifyAuthorityEvent } from '../../community-authority.js'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

interface AuthorityEventRecord {
  community: string
  subject: string
  action: AuthorityAction
  issuer: string
  effectiveAt: string
  expiresAt?: string
  predecessor?: string
  version: number
  basis: AuthorityBasis
  evidence?: string
  createdAt: string
}

type IndexedAuthorityEvent = Selectable<
  DatabaseSchemaType['para_community_authority_event']
>

const lexId = 'com.para.community.authorityEvent'

async function insertFn(
  db: DatabaseSchema,
  uri: AtUri,
  cid: CID,
  event: AuthorityEventRecord,
  timestamp: string,
): Promise<IndexedAuthorityEvent | null> {
  const database = { db } as Database
  if (
    event.version !== AUTHORITY_EVENT_VERSION &&
    !(await db
      .selectFrom('para_community_authority_event')
      .where('communityUri', '=', event.community)
      .where('subject', '=', event.subject)
      .select('id')
      .executeTakeFirst())
  ) {
    return null
  }
  if (!(await verifyAuthorityEvent(database, uri, event))) return null
  return (
    (await db
      .insertInto('para_community_authority_event')
      .values({
        id: uri.toString(),
        uri: uri.toString(),
        cid: cid.toString(),
        creator: uri.host,
        communityUri: event.community,
        subject: event.subject,
        action: event.action,
        issuer: event.issuer,
        effectiveAt: normalizeDatetimeAlways(event.effectiveAt),
        expiresAt: event.expiresAt
          ? normalizeDatetimeAlways(event.expiresAt)
          : null,
        predecessor: event.predecessor ?? null,
        version: event.version,
        basis: event.basis,
        evidence: event.evidence ?? null,
        createdAt: normalizeDatetimeAlways(event.createdAt),
        indexedAt: timestamp,
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .returningAll()
      .executeTakeFirst()) ??
    (await db
      .selectFrom('para_community_authority_event')
      .where('id', '=', uri.toString())
      .selectAll()
      .executeTakeFirst()) ??
    null
  )
}

async function findDuplicate() {
  return null
}

async function deleteFn(
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedAuthorityEvent | null> {
  return (
    (await db
      .selectFrom('para_community_authority_event')
      .where('id', '=', uri.toString())
      .selectAll()
      .executeTakeFirst()) ?? null
  )
}

export type PluginType = RecordProcessor<
  AuthorityEventRecord,
  IndexedAuthorityEvent
>

export function makePlugin(
  db: Database,
  background: BackgroundQueue,
): PluginType {
  return new RecordProcessor(db, background, {
    lexId,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert: () => [],
    notifsForDelete: () => ({ notifs: [], toDelete: [] }),
  })
}
