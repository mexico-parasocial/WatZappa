export type Scope =
  | { mode: 'community' }
  | { mode: 'topic'; topic: string }
  | { mode: 'proposal'; proposal: string }

export interface Election {
  mode: 'synthetic'
  rulesVersion: 'g1-follow-signal-v1'
  id: string
  community: string
  participants: string[]
  proposals: { id: string; topic: string; label: string }[]
  opensAt: number
  closesAt: number
  creditsPerParticipant: number
  quorumBps: number
  maxDelegationDepth: number
  publicationMinimum: number
}

export interface EventEnvelope {
  id: string
  election: string
  actor: string
  sequence: number
  acceptedAt: number
}

export type ElectionEvent = EventEnvelope &
  (
    | { kind: 'vote'; proposal: string; signal: number }
    | { kind: 'withdraw'; proposal: string }
    | { kind: 'delegate'; delegate: string; scope: Scope; expiresAt: number }
    | { kind: 'revoke'; delegation: string }
  )

export type DelegationEvent = Extract<ElectionEvent, { kind: 'delegate' }>

export interface Resolution {
  participant: string
  proposal: string
  source: string | null
  signal: number | null
  cost: number
  depth: number
  status: 'direct' | 'delegated' | 'no-vote' | 'cycle' | 'depth-limit'
}

export interface ProposalResult {
  proposal: string
  eligible: number
  represented: number
  direct: number
  delegated: number
  unresolved: number
  support: number
  oppose: number
  abstain: number
  flatSignalSum: number
  intensitySignalSum: number
  creditsSpent: number
  quorumTarget: number
  quorumMet: boolean
}

export interface LabSnapshot {
  labOnly: true
  election: string
  rulesVersion: Election['rulesVersion']
  revision: number
  cutoff: number
  phase: 'scheduled' | 'open' | 'closed'
  resolutions: Resolution[]
  budgets: { participant: string; spent: number; remaining: number }[]
  results: ProposalResult[]
  publication:
    | { state: 'withheld'; reason: 'not-closed' | 'small-cohort' }
    | { state: 'synthetic-final'; results: ProposalResult[] }
}
