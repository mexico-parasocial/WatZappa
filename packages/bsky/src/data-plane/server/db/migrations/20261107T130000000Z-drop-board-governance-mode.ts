import { type Kysely, sql } from 'kysely'
import type { CommunityAuthorityEvent } from '@atproto/common'
import { AtUri } from '@atproto/syntax'
import { verifyAuthorityEvent } from '../../community-authority.js'
import type { DatabaseSchemaType } from '../database-schema.js'
import type { Database } from '../index.js'

/**
 * A community used to pick a governance model, and `horizontal` founded its
 * creator as a 90-day moderator instead of as owner. Every community is
 * hierarchical now, so the column goes. Authority derived under the retired
 * model (the expiring founding grant) is rebuilt under the remaining rules,
 * which leaves those communities without an owner.
 */
export async function up(input: Kysely<unknown>): Promise<void> {
  const db = input as Kysely<DatabaseSchemaType>
  const retired = await sql<{ uri: string }>`
    select "uri" from "para_community_board" where "governanceMode" = 'horizontal'
  `.execute(db)
  const database = { db } as Database
  for (const { uri: communityUri } of retired.rows) {
    const rows = await db
      .selectFrom('para_community_authority_event')
      .where('communityUri', '=', communityUri)
      .selectAll()
      .orderBy('indexedAt', 'asc')
      .orderBy('version', 'asc')
      .orderBy('uri', 'asc')
      .execute()
    await db
      .deleteFrom('para_community_authority_event')
      .where('communityUri', '=', communityUri)
      .execute()
    for (const row of rows) {
      const uri = new AtUri(row.uri)
      if (uri.host !== row.creator) continue
      if (row.basis === 'migration') {
        // @NOTE grandfathered membership stays; so does the board creator's office.
        const board = await db
          .selectFrom('para_community_board')
          .where('uri', '=', communityUri)
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
      await db
        .insertInto('para_community_authority_event')
        .values(row)
        .execute()
    }
  }
  await sql`alter table "para_community_board" drop column "governanceMode"`.execute(
    db,
  )
}

export async function down(input: Kysely<unknown>): Promise<void> {
  // @NOTE authority discarded by verification is not restored on rollback.
  const db = input as Kysely<DatabaseSchemaType>
  await sql`
    alter table "para_community_board"
    add column "governanceMode" varchar default 'hierarchical'
  `.execute(db)
}
