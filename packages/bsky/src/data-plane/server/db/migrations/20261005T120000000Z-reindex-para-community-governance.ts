import { type Kysely, sql } from 'kysely'

/*
 * `para_community_governance` used to treat any two governance records naming
 * the same community as duplicates, whoever wrote them, so a record published
 * first by any account kept the community's real record out of the table.
 * Duplicates are now per author. This re-indexes every governance record from
 * `record` (which holds duplicates too) and drops the cross-author duplicate
 * entries. Board views read only the row a community trusts; see
 * `community-governance.ts`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    INSERT INTO para_community_governance (
      uri, cid, "communityUri", state, "matterFlairIds", "policyFlairIds",
      "moderatorCount", "officialCount", "deputyRoleCount", "lastPublishedAt",
      "indexedAt"
    )
    SELECT
      uri,
      cid,
      coalesce(record_json->>'community', ''),
      record_json->'metadata'->>'state',
      record_json->'metadata'->'matterFlairIds',
      record_json->'metadata'->'policyFlairIds',
      CASE WHEN jsonb_typeof(record_json->'moderators') = 'array'
        THEN jsonb_array_length(record_json->'moderators') ELSE 0 END,
      CASE WHEN jsonb_typeof(record_json->'officials') = 'array'
        THEN jsonb_array_length(record_json->'officials') ELSE 0 END,
      CASE WHEN jsonb_typeof(record_json->'deputies') = 'array'
        THEN jsonb_array_length(record_json->'deputies') ELSE 0 END,
      coalesce(
        record_json->'metadata'->>'lastPublishedAt',
        record_json->>'updatedAt'
      ),
      "indexedAt"
    FROM (
      SELECT uri, cid, json::jsonb AS record_json, "indexedAt"
      FROM record
      WHERE uri LIKE 'at://%/com.para.community.governance/%'
    ) governance
    ON CONFLICT (uri) DO UPDATE SET
      cid = EXCLUDED.cid,
      "communityUri" = EXCLUDED."communityUri",
      state = EXCLUDED.state,
      "matterFlairIds" = EXCLUDED."matterFlairIds",
      "policyFlairIds" = EXCLUDED."policyFlairIds",
      "moderatorCount" = EXCLUDED."moderatorCount",
      "officialCount" = EXCLUDED."officialCount",
      "deputyRoleCount" = EXCLUDED."deputyRoleCount",
      "lastPublishedAt" = EXCLUDED."lastPublishedAt",
      "indexedAt" = EXCLUDED."indexedAt"
  `.execute(db)

  await sql`
    DELETE FROM duplicate_record
    WHERE uri LIKE 'at://%/com.para.community.governance/%'
      AND split_part(uri, '/', 3) <> split_part("duplicateOf", '/', 3)
  `.execute(db)
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Re-indexed rows are ordinary index rows; nothing to undo.
}
