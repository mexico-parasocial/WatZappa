export const tableName = 'para_profile_stats'

export interface ParaProfileStats {
  did: string
  influence: number
  votesReceivedAllTime: number
  votesCastAllTime: number
  policies: number
  matters: number
  comments: number
  activeIn: string[] | null
  computedAt: string
}

export type PartialDB = {
  [tableName]: ParaProfileStats
}
