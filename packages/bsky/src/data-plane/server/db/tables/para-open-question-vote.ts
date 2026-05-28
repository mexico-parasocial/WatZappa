import { GeneratedAlways } from 'kysely'

export const tableName = 'para_open_question_vote'

export interface ParaOpenQuestionVote {
  uri: string
  cid: string
  creator: string
  subject: string
  value: number
  voteNullifier: string | null
  eligibilityProofRef: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: ParaOpenQuestionVote
}
