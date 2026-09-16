export interface ParaPolicyPublication {
  space: string
  issuer: string
  audience: string
  sourceUri: string
  sourceVersion: number
  policyEpoch: number
  projectionDigest: string | null
  acknowledgedVersion: number
  deliveryStatus: 'ready' | 'recovery-required' | 'checkpoint-pending'
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
  /** 'checkpoint' entries answer a receiver challenge and replace pending updates. */
  artifactKind: 'update' | 'checkpoint'
  /** The single-use receiver challenge this checkpoint answers. */
  challengeId: string | null
  /** Set when a confirmed checkpoint replaced this entry; it is never delivered after that. */
  supersededAt: number | null
}

export type PartialDB = {
  para_policy_publication: ParaPolicyPublication
  para_policy_outbox: ParaPolicyOutboxEntry
}
