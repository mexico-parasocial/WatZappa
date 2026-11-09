import { type Kysely, sql } from 'kysely'

/*
 * `para_community_relation` held one row per (parent, child, relation),
 * whoever wrote it, and the indexer's duplicate and cycle checks looked at
 * every author. So the first account to name a pair, or its reverse, kept
 * the parent owner's own link out of the table. Uniqueness and cycles are now
 * per author, and reads count only links the parent's owner wrote (see
 * `filterTrustedRelations`). This re-indexes every relation record from
 * `record`, which holds the ones turned away, and drops the cross-author
 * duplicate entries.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex('para_community_relation_pair_idx').execute()
  await db.schema
    .createIndex('para_community_relation_author_pair_idx')
    .on('para_community_relation')
    .columns(['creator', 'parentCommunityUri', 'childCommunityUri', 'relation'])
    .unique()
    .execute()

  await sql`
    INSERT INTO para_community_relation (
      uri, cid, creator, rkey, "parentCommunityUri", "childCommunityUri",
      relation, "createdAt", "indexedAt"
    )
    SELECT
      uri,
      cid,
      split_part(uri, '/', 3),
      split_part(uri, '/', 5),
      record_json->>'parentCommunityUri',
      record_json->>'childCommunityUri',
      record_json->>'relation',
      record_json->>'createdAt',
      "indexedAt"
    FROM (
      SELECT uri, cid, json::jsonb AS record_json, "indexedAt"
      FROM record
      WHERE uri LIKE 'at://%/com.para.community.relation/%'
    ) relation
    WHERE record_json->>'parentCommunityUri' IS NOT NULL
      AND record_json->>'childCommunityUri' IS NOT NULL
      AND record_json->>'relation' IS NOT NULL
      AND record_json->>'createdAt' IS NOT NULL
      AND record_json->>'parentCommunityUri' <> record_json->>'childCommunityUri'
    ORDER BY "indexedAt", uri
    ON CONFLICT DO NOTHING
  `.execute(db)

  await sql`
    DELETE FROM duplicate_record
    WHERE uri LIKE 'at://%/com.para.community.relation/%'
      AND split_part(uri, '/', 3) <> split_part("duplicateOf", '/', 3)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Several authors may now hold the same pair, so the old index returns
  // without its uniqueness; re-indexed rows stay.
  await db.schema.dropIndex('para_community_relation_author_pair_idx').execute()
  await db.schema
    .createIndex('para_community_relation_pair_idx')
    .on('para_community_relation')
    .columns(['parentCommunityUri', 'childCommunityUri', 'relation'])
    .execute()
}
