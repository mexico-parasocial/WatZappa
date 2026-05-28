export const tableName = 'para_community_governance'

export interface ParaCommunityGovernance {
  uri: string
  cid: string
  communityUri: string
  state: string | null
  matterFlairIds: string[] | null
  policyFlairIds: string[] | null
  moderatorCount: number
  officialCount: number
  deputyRoleCount: number
  lastPublishedAt: string | null
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityGovernance
}
