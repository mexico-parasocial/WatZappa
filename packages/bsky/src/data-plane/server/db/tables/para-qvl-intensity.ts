import { GeneratedAlways } from 'kysely'

export const tableName = 'para_qvld_intensity'

export interface ParaQvldIntensity {
  uri: string
  cid: string
  creator: string
  proposal: string
  voter: string
  signal: number
  units: number
  creditsSpent: number
  delegatedFrom: string[] | null
  delegationDepth: number
  effectiveWeight: string | null
  voteNullifier: string | null
  eligibilityProofRef: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: ParaQvldIntensity
}
