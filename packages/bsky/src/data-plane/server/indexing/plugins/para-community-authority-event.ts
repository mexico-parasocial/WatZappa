import type { Selectable } from 'kysely'
import {
  AUTHORITY_EVENT_VERSION,
  type AuthorityAction,
  type AuthorityBasis,
} from '@atproto/common'
import type { Cid } from '@atproto/lex'
import { type AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { com } from '../../../../lexicons.js'
import type { BackgroundQueue } from '../../background.js'
import { verifyAuthorityEvent } from '../../community-authority.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

type IndexedAuthorityEvent = Selectable<
  DatabaseSchemaType['para_community_authority_event']
>

// The lexicon leaves action and basis open; authority only derives from the
// ones it defines, so an event with any other value is not indexed.
const AUTHORITY_ACTIONS: ReadonlySet<string> = new Set<AuthorityAction>([
  'member.activate',
  'member.suspend',
  'member.reinstate',
  'member.remove',
  'member.block',
  'moderator.grant',
  'moderator.revoke',
  'moderator.resign',
  'owner.grant',
  'owner.revoke',
])
const AUTHORITY_BASES: ReadonlySet<string> = new Set<AuthorityBasis>([
  'openAdmission',
  'assemblyDecision',
  'ownerAppointment',
  'ownerTransfer',
  'foundingTransition',
  'resignation',
  'expiry',
  'migration',
])

async function insertFn(
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  record: com.para.community.authorityEvent.Main,
  timestamp: string,
): Promise<IndexedAuthorityEvent | null> {
  if (
    !AUTHORITY_ACTIONS.has(record.action) ||
    !AUTHORITY_BASES.has(record.basis)
  ) {
    return null
  }
  const event = {
    ...record,
    action: record.action as AuthorityAction,
    basis: record.basis as AuthorityBasis,
  }
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
  typeof com.para.community.authorityEvent.main,
  IndexedAuthorityEvent
>

export function makePlugin(
  db: Database,
  background: BackgroundQueue,
): PluginType {
  return new RecordProcessor(db, background, {
    schema: com.para.community.authorityEvent.main,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert: () => [],
    notifsForDelete: () => ({ notifs: [], toDelete: [] }),
  })
}
