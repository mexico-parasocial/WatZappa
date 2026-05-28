import { GeneratedAlways } from 'kysely'

export const tableName = 'raq_axis_vote'

export interface Main {
  uri: string
  cid: string
  creator: string
  axisId: string
  value: number
  voteNullifier: string | null
  eligibilityProofRef: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: Main
}
