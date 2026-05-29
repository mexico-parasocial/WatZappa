export const tableName = 'para_qvld_governance_config'

export interface ParaQvldGovernanceConfig {
  uri: string
  cid: string
  creator: string
  community: string
  version: string
  metaRules: unknown // JSON: quorumPct, thresholdPct, amendmentQuorumPct, maxIntensityUnits
  civicTreeRules: unknown | null // JSON: windowHours, minStatements, clusteringEnabled
  delegationRules: unknown | null // JSON: eligibleRoles, maxDepth, autoExpireDays
  countingRules: unknown | null // JSON: modes, correlationAlpha, bindingMode
  visibilityRules: unknown | null // JSON: civicTreePublic, votesPublic, delegationGraphPublic
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaQvldGovernanceConfig
}
