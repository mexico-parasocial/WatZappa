import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    INSERT INTO para_community_governance (
      uri, cid, "communityUri", state, "matterFlairIds", "policyFlairIds", 
      "moderatorCount", "officialCount", "deputyRoleCount", "lastPublishedAt", "indexedAt"
    )
    SELECT 
      uri, 
      cid, 
      (record_json->>'community')::text as "communityUri",
      (record_json->'metadata'->>'state')::text as state,
      (record_json->'metadata'->'matterFlairIds')::jsonb as "matterFlairIds",
      (record_json->'metadata'->'policyFlairIds')::jsonb as "policyFlairIds",
      COALESCE(jsonb_array_length(record_json->'moderators'), 0) as "moderatorCount",
      COALESCE(jsonb_array_length(record_json->'officials'), 0) as "officialCount",
      COALESCE(jsonb_array_length(record_json->'deputies'), 0) as "deputyRoleCount",
      COALESCE((record_json->'metadata'->>'lastPublishedAt')::text, (record_json->>'updatedAt')::text) as "lastPublishedAt",
      "indexedAt"
    FROM (
      SELECT uri, cid, json::jsonb as record_json, "indexedAt"
      FROM record
    ) record
    WHERE uri LIKE 'at://%/com.para.community.governance/%'
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
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.deleteFrom('para_community_governance').execute()
}
