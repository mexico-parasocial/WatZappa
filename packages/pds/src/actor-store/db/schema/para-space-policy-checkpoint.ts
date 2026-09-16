/** Exact receipt of the latest installed recovery checkpoint for a space. */
export interface ParaSpacePolicyCheckpoint {
  space: string
  sourceIssuer: string
  sourceUri: string
  sourceVersion: number
  policyEpoch: number
  projectionDigest: string
  challengeId: string
  installedAt: string
  signedCheckpoint: string
}

const tableName = 'para_space_policy_checkpoint'

export type PartialDB = { [tableName]: ParaSpacePolicyCheckpoint }
