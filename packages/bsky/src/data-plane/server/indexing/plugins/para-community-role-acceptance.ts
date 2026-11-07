import type { Selectable } from 'kysely'
import type { Cid, l } from '@atproto/lex-schema'
import { type AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { com } from '../../../../lexicons/index.js'
import type { BackgroundQueue } from '../../background.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

const schema = com.para.community.roleAcceptance.main
type RoleAcceptanceSchema = typeof schema
type RoleAcceptanceRecord = l.InferInput<RoleAcceptanceSchema>

type IndexedRoleAcceptance = Selectable<
  DatabaseSchemaType['para_community_role_acceptance']
>

/**
 * An acceptance counts only from the member the offer names, for an offer that
 * is indexed and matches its community and role. The first acceptance of an
 * offer stands (the offer column is unique); a withdrawn one (deleted record)
 * frees the offer again.
 */
async function insertFn(
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  acceptance: RoleAcceptanceRecord,
  timestamp: string,
): Promise<IndexedRoleAcceptance | null> {
  if (acceptance.role !== 'moderator') return null
  if (acceptance.subject !== uri.host) return null
  const offer = await db
    .selectFrom('para_community_role_offer')
    .where('uri', '=', acceptance.offer)
    .selectAll()
    .executeTakeFirst()
  if (
    !offer ||
    offer.communityUri !== acceptance.community ||
    offer.subject !== acceptance.subject ||
    offer.role !== acceptance.role
  ) {
    return null
  }
  return (
    (await db
      .insertInto('para_community_role_acceptance')
      .values({
        uri: uri.toString(),
        cid: cid.toString(),
        creator: uri.host,
        communityUri: acceptance.community,
        role: acceptance.role,
        subject: acceptance.subject,
        offerUri: acceptance.offer,
        createdAt: normalizeDatetimeAlways(acceptance.createdAt),
        indexedAt: timestamp,
      })
      .onConflict((oc) => oc.doNothing())
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

async function findDuplicate() {
  return null
}

async function deleteFn(
  db: DatabaseSchema,
  uri: AtUri,
): Promise<IndexedRoleAcceptance | null> {
  return (
    (await db
      .deleteFrom('para_community_role_acceptance')
      .where('uri', '=', uri.toString())
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

export type PluginType = RecordProcessor<
  RoleAcceptanceSchema,
  IndexedRoleAcceptance
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
