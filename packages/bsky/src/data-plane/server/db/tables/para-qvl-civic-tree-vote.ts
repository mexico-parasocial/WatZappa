import { GeneratedAlways } from 'kysely'

export const tableName = 'para_qvld_civicTree_vote'

export interface ParaQvldCivicTreeVote {
  uri: string
  cid: string
  creator: string
  statement: string
  voter: string
  vote: string
  voteNullifier: string | null
  eligibilityProofRef: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: ParaQvldCivicTreeVote
}
