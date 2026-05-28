import { GeneratedAlways } from 'kysely'

export const tableName = 'para_qvld_delegation'

export interface ParaQvldDelegation {
  uri: string
  cid: string
  creator: string
  delegate: string
  delegator: string
  delegateRole: string | null
  party: string | null
  scopeMode: string
  scopeCommunity: string | null
  scopeTopic: string | null
  scopeProposal: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: ParaQvldDelegation
}
