import type { Kysely } from 'kysely'
import type { CommunityAuthorityEvent } from '@atproto/common'
import { AtUri } from '@atproto/syntax'
import { verifyAuthorityEvent } from '../../community-authority.js'
import type { DatabaseSchemaType } from '../database-schema.js'
import type { Database } from '../index.js'

/** Rebuild derived authority, including grants that depended on a forged issuer. */
export async function up(input: Kysely<unknown>): Promise<void> {
  const db = input as Kysely<DatabaseSchemaType>
  const rows = await db
    .selectFrom('para_community_authority_event')
    .selectAll()
    .orderBy('indexedAt', 'asc')
    .orderBy('version', 'asc')
    .orderBy('uri', 'asc')
    .execute()
  await db.deleteFrom('para_community_authority_event').execute()
  const database = { db } as Database
  for (const row of rows) {
    const uri = new AtUri(row.uri)
    if (uri.host !== row.creator) continue
    if (row.basis === 'migration') {
      // @NOTE preserve grandfathered membership and only the board creator's office.
      const board = await db
        .selectFrom('para_community_board')
        .where('uri', '=', row.communityUri)
        .select('creator')
        .executeTakeFirst()
      if (
        !board ||
        (row.action !== 'member.activate' &&
          !(
            board.creator === row.subject &&
            ['owner.grant', 'moderator.grant'].includes(row.action)
          ))
      )
        continue
    } else {
      const event = {
        community: row.communityUri,
        subject: row.subject,
        action: row.action as CommunityAuthorityEvent['action'],
        issuer: row.issuer,
        effectiveAt: row.effectiveAt,
        expiresAt: row.expiresAt,
        predecessor: row.predecessor,
        version: row.version,
        basis: row.basis as CommunityAuthorityEvent['basis'],
        evidence: row.evidence,
      }
      if (!(await verifyAuthorityEvent(database, uri, event))) continue
    }
    await db.insertInto('para_community_authority_event').values(row).execute()
  }
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // @NOTE authority discarded by verification must not be restored as a rollback.
}
