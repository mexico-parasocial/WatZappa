export interface ParaSpacePolicyDelta {
  space: string
  sourceVersion: number
  kind: string
  sourceUri: string
  sourceCid: string
  sourceIssuer: string
  policyEpoch: number
  previousDeltaDigest: string | null
  projectionDigest: string
  issuedAt: string
  receivedAt: string
  signedDelta: string
}

const tableName = 'para_space_policy_delta'

export type PartialDB = { [tableName]: ParaSpacePolicyDelta }
