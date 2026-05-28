import { GeneratedAlways } from 'kysely'

export const tableName = 'para_policy_vote'

export interface ParaPolicyVote {
  uri: string
  cid: string
  creator: string
  subject: string
  subjectType: string
  signal: number
  isDirect: 0 | 1
  delegatedFrom: string[] | null
  voteNullifier: string | null
  eligibilityProofRef: string | null
  reason: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: ParaPolicyVote
}
