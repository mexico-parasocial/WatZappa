export interface ParaPolicyPublication {
  space: string
  issuer: string
  audience: string
  sourceUri: string
  sourceVersion: number
  policyEpoch: number
  projectionDigest: string | null
  acknowledgedVersion: number
  deliveryStatus: 'ready' | 'recovery-required'
}

export interface ParaPolicyOutboxEntry {
  space: string
  sourceVersion: number
  policyEpoch: number
  eventId: string
  inputDigest: string
  assertion: string
  projectionDigest: string
  expiresAt: number
  leaseTokenHash: string | null
  leaseUntil: number | null
  acknowledgedAt: number | null
}

export type PartialDB = {
  para_policy_publication: ParaPolicyPublication
  para_policy_outbox: ParaPolicyOutboxEntry
}
