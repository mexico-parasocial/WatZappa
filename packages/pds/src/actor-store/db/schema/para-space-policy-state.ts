export interface ParaSpacePolicyState {
  space: string
  sourceUri: string
  sourceCid: string
  sourceIssuer: string
  sourceVersion: number
  policyEpoch: number
  projectionDigest: string
  projectionStatus: string
  issuedAt: string
  receivedAt: string
  signedDelta: string
}

const tableName = 'para_space_policy_state'

export type PartialDB = { [tableName]: ParaSpacePolicyState }
