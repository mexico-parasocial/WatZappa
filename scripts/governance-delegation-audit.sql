-- Read-only dry run. Run against an authorized staging COPY with the correct
-- AppView schema in search_path. Prints only counts, never DIDs or ballot data.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';

SELECT
  count(*) AS total,
  count(*) FILTER (WHERE "delegator" IS DISTINCT FROM "creator") AS forged_delegator,
  count(*) FILTER (WHERE "delegate" = "creator") AS self_delegation,
  count(*) FILTER (WHERE "expiresAt" IS NULL) AS missing_expiry,
  count(*) FILTER (WHERE "revokedAt" IS NOT NULL) AS revoked,
  count(*) FILTER (WHERE
    "scopeMode" NOT IN ('proposal', 'topic', 'community', 'topicCommunity') OR
    "scopeMode" IS NULL OR
    ("scopeMode" = 'proposal' AND nullif("scopeProposal", '') IS NULL) OR
    ("scopeMode" IN ('topic', 'topicCommunity') AND nullif("scopeTopic", '') IS NULL) OR
    ("scopeMode" IN ('community', 'topicCommunity') AND nullif("scopeCommunity", '') IS NULL)
  ) AS malformed_scope
FROM para_qvld_delegation;

-- Potential ambiguity only: expiry and revocation require a versioned policy
-- before choosing any record or deleting/reindexing anything.
SELECT count(*) AS overlapping_scope_groups
FROM (
  SELECT "creator", "scopeMode", "scopeCommunity", "scopeTopic", "scopeProposal"
  FROM para_qvld_delegation
  WHERE "revokedAt" IS NULL
  GROUP BY "creator", "scopeMode", "scopeCommunity", "scopeTopic", "scopeProposal"
  HAVING count(*) > 1
) AS groups;

SELECT
  count(*) AS total,
  count(*) FILTER (WHERE "delegateTo" = "creator") AS self_delegation,
  count(*) FILTER (WHERE "mode" = 'passive') AS requires_party_resolver
FROM cabildeo_delegation;
ROLLBACK;
