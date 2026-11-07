import { sql } from 'kysely'
import { resolveCommunityAccountUris } from './community-membership.js'
import type { DatabaseSchema } from './db/database-schema.js'
import type { Database } from './db/index.js'

export const normalizeCommunitySlug = (value: string) =>
  value
    .replace(/^p\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * The community a cabildeo's or policy's `community` names: a board by its
 * URI, slug or name, or else a community account (OD-9) by its profile URI,
 * DID, handle or slug. Voter eligibility is judged against this community's
 * authority (`filterActiveMembers`), so every path that asks who may vote
 * resolves it here.
 */
export async function resolveCabildeoBoard(
  db: DatabaseSchema,
  community: string,
): Promise<{ uri: string } | undefined> {
  const board = await selectBoard(db, community)
  if (board) return board
  const [account] = await resolveCommunityAccountUris(
    { db } as Database,
    community,
  )
  return account ? { uri: account } : undefined
}

function selectBoard(db: DatabaseSchema, community: string) {
  const slug = normalizeCommunitySlug(community)
  return db
    .selectFrom('para_community_board')
    .where((eb) =>
      eb.or([
        eb('uri', '=', community),
        eb('slug', '=', slug),
        eb(
          sql`regexp_replace(lower(coalesce("name", '')), '[^a-z0-9]+', '-', 'g')`,
          '=',
          slug,
        ),
      ]),
    )
    .select(['uri'])
    .executeTakeFirst()
}
