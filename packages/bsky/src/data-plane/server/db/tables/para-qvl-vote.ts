import { GeneratedAlways } from 'kysely'

export const tableName = 'para_qvld_vote'

export interface ParaQvldVote {
  uri: string
  cid: string
  creator: string
  proposal: string
  community: string
  signal: number
  voteNullifier: string | null
  eligibilityProofRef: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: ParaQvldVote
}
