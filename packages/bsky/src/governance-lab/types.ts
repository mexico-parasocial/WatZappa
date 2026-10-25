export type Scope =
  | { mode: 'community' }
  | { mode: 'topic'; topic: string }
  | { mode: 'proposal'; proposal: string }

export interface Election {
  mode: 'synthetic'
  /**
   * v1 rejects any state that overspends a follower's budget. v2 (product
   * decision 2026-10-20) drops that follower's delegated units instead, fixes
   * quorum at 50 % and decides each proposal: net intensity > 0 passes, a tie
   * keeps the status quo.
   */
  rulesVersion: 'g1-follow-signal-v1' | 'g1-follow-signal-v2'
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
  status:
    | 'direct'
    | 'delegated'
    | 'no-vote'
    | 'cycle'
    | 'depth-limit'
    /** v2: the delegated signal would overspend this participant's own budget. */
    | 'over-budget'
}

export type ProposalOutcome =
  | { decision: 'passed'; reason: 'net-support' }
  | { decision: 'failed'; reason: 'net-opposition' | 'tie-status-quo' }
  | { decision: 'failed'; reason: 'quorum-not-met' }

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
  /** v2 only. v1 returns magnitudes without a decision. */
  outcome?: ProposalOutcome
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
