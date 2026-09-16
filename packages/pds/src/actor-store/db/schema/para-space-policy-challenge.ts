export interface ParaSpacePolicyChallenge {
  space: string
  challengeId: string
  /** SHA-256 of the single-use secret; the secret itself is only shown at issuance. */
  secretHash: string
  sourceIssuer: string
  sourceUri: string
  acceptedSourceVersion: number
  acceptedProjectionDigest: string
  maxSourceVersion: number
  maxPolicyEpoch: number
  issuedAt: string
  expiresAt: string
  consumedAt: string | null
}

const tableName = 'para_space_policy_challenge'

export type PartialDB = { [tableName]: ParaSpacePolicyChallenge }
