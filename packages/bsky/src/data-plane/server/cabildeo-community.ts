import { sql } from 'kysely'
import type { DatabaseSchema } from './db/database-schema.js'

export const normalizeCommunitySlug = (value: string) =>
  value
    .replace(/^p\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * The community board a cabildeo's `community` names: the board's URI, its
 * slug, or its name. Voter eligibility is judged against this board's authority
 * events, so every path that asks who may vote resolves the board here.
 */
export async function resolveCabildeoBoard(
  db: DatabaseSchema,
  community: string,
): Promise<{ uri: string } | undefined> {
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
