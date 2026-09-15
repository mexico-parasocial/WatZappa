export interface M8AssuranceChallenge {
  nonceHash: string
  issuer: string
  did: string
  clientId: string
  dpopJkt: string
  space: string
  audience: string
  issuedAt: number
  expiresAt: number
  consumedAt: number | null
}

export interface M8AssuranceReceipt {
  issuer: string
  jtiHash: string
  consumedAt: number
  retainUntil: number
}

export type PartialDB = {
  m8_assurance_challenge: M8AssuranceChallenge
  m8_assurance_receipt: M8AssuranceReceipt
}
