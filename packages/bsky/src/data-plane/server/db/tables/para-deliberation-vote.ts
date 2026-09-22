import { GeneratedAlways } from 'kysely'

export const tableName = 'para_deliberation_vote'

export interface ParaDeliberationVote {
  uri: string
  cid: string
  creator: string
  statement: string
  direction: string
  voteNullifier: string | null
  eligibilityProofRef: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: ParaDeliberationVote
}
