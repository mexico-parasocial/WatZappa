import type { Selectable } from 'kysely'
import type { Cid, l } from '@atproto/lex-schema'
import { type AtUri, normalizeDatetimeAlways } from '@atproto/syntax'
import { com } from '../../../../lexicons/index.js'
import type { BackgroundQueue } from '../../background.js'
import { getAuthoritySnapshot } from '../../community-authority.js'
import type {
  DatabaseSchema,
  DatabaseSchemaType,
} from '../../db/database-schema.js'
import type { Database } from '../../db/index.js'
import { RecordProcessor } from '../processor.js'

const schema = com.para.community.roleOffer.main
type RoleOfferSchema = typeof schema
type RoleOfferRecord = l.InferInput<RoleOfferSchema>

type IndexedRoleOffer = Selectable<
  DatabaseSchemaType['para_community_role_offer']
>

/**
 * An offer counts only from a current owner, to an active member, for the one
 * role that is offered. Anything else is not indexed, so it never reaches the
 * member's list and can never ground an appointment.
 */
async function insertFn(
  db: DatabaseSchema,
  uri: AtUri,
  cid: Cid,
  offer: RoleOfferRecord,
  timestamp: string,
): Promise<IndexedRoleOffer | null> {
  if (offer.role !== 'moderator') return null
  if (offer.subject === uri.host) return null
  const database = { db } as Database
  const board = await db
    .selectFrom('para_community_board')
    .where('uri', '=', offer.community)
    .select('uri')
    .executeTakeFirst()
  if (!board) return null
  const owner = await getAuthoritySnapshot(database, offer.community, uri.host)
  if (!owner.roles.includes('owner')) return null
  const subject = await getAuthoritySnapshot(
    database,
    offer.community,
    offer.subject,
  )
  if (subject.membershipState !== 'active') return null
  return (
    (await db
      .insertInto('para_community_role_offer')
      .values({
        uri: uri.toString(),
        cid: cid.toString(),
        creator: uri.host,
        communityUri: offer.community,
        role: offer.role,
        subject: offer.subject,
        createdAt: normalizeDatetimeAlways(offer.createdAt),
        indexedAt: timestamp,
      })
      .onConflict((oc) => oc.column('uri').doNothing())
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
): Promise<IndexedRoleOffer | null> {
  return (
    (await db
      .deleteFrom('para_community_role_offer')
      .where('uri', '=', uri.toString())
      .returningAll()
      .executeTakeFirst()) ?? null
  )
}

export type PluginType = RecordProcessor<RoleOfferSchema, IndexedRoleOffer>

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
