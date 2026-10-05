import { type Selectable } from 'kysely'
import type { Cid, l } from '@atproto/lex'
import {
  type AuthorityAction,
  type AuthorityBasis,
  AUTHORITY_EVENT_VERSION,
} from '@atproto/common'
import { AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { verifyAuthorityEvent } from '../../community-authority.js'
import type { BackgroundQueue } from '../../background.js'
import { com } from '../../../../lexicons/index.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

const schema = com.para.community.authorityEvent.main
type AuthorityEventSchema = typeof schema
/**
 * The record as it arrives over the wire. `action` and `basis` are open unions
 * here (`l.UnknownString`) because the lexicon declares them as knownValues,
 * not an enum — a future or malformed writer can put anything in them.
 */
type AuthorityEventRecord = l.InferInput<AuthorityEventSchema>

type IndexedAuthorityEvent = Selectable<
  DatabaseSchemaType['para_community_authority_event']
>

const KNOWN_ACTIONS: readonly AuthorityAction[] = [
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
]

const KNOWN_BASES: readonly AuthorityBasis[] = [
  'openAdmission',
  'assemblyDecision',
  'ownerAppointment',
  'ownerTransfer',
  'foundingTransition',
  'resignation',
  'expiry',
  'migration',
]

/**
 * Narrow the open unions to the actions and bases this build understands, as an
 * allowlist. An authority event decides membership and moderation power, so an
 * `action` or `basis` we cannot interpret must not be indexed at all: indexing
 * it would let `deriveEffectiveAuthority` see an event it then ignores, and a
 * later reader on a newer build would disagree about who holds authority.
 */
function knownEvent(event: AuthorityEventRecord): {
  action: AuthorityAction
  basis: AuthorityBasis
} | null {
  const action = KNOWN_ACTIONS.find((candidate) => candidate === event.action)
  const basis = KNOWN_BASES.find((candidate) => candidate === event.basis)
  if (!action || !basis) return null
  return { action, basis }
}

async function insertFn(
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  event: AuthorityEventRecord,
  timestamp: string,
): Promise<IndexedAuthorityEvent | null> {
  const database = { db } as Database
  const known = knownEvent(event)
  if (!known) return null
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
  if (!(await verifyAuthorityEvent(database, uri, { ...event, ...known })))
    return null
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
        action: known.action,
        issuer: event.issuer,
        effectiveAt: normalizeDatetimeAlways(event.effectiveAt),
        expiresAt: event.expiresAt
          ? normalizeDatetimeAlways(event.expiresAt)
          : null,
        predecessor: event.predecessor ?? null,
        version: event.version,
        basis: known.basis,
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
  AuthorityEventSchema,
  IndexedAuthorityEvent
>

export function makePlugin(
  db: Database,
  background: BackgroundQueue,
): PluginType {
  return new RecordProcessor(db, background, {
    schema,
    insertFn,
    findDuplicate,
    deleteFn,
    notifsForInsert: () => [],
    notifsForDelete: () => ({ notifs: [], toDelete: [] }),
  })
}
