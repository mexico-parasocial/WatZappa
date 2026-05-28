/**
 * Constitution as Code — Programmable Governance for PARA Communities
 *
 * Each community defines its rules as an AT Protocol record.
 * The bridge reads, validates, and enforces these rules automatically.
 *
 * This transforms governance from "gentlemen's agreements" into
 * executable, auditable, versioned policy.
 */

export interface AutoModerationRules {
  enabled: boolean
  spamThreshold?: number
  toxicityThreshold?: number
}

export interface BudgetRules {
  enabled: boolean
  matchingPool?: number
  minContribution?: number
  roundDurationDays?: number
}

export interface GovernanceRules {
  quorum?: number
  approvalThreshold?: number
  deliberationDays?: number
  votingDays?: number
  chamberSize?: number
  observerSize?: number
  autoModeration?: AutoModerationRules
  budget?: BudgetRules
}

export interface CommunityConstitution {
  community: string
  version: number
  rules: GovernanceRules
  createdAt: string
}

const DEFAULT_RULES: GovernanceRules = {
  quorum: 0.51,
  approvalThreshold: 0.5,
  deliberationDays: 7,
  votingDays: 3,
  chamberSize: 135,
  observerSize: 30,
  autoModeration: { enabled: false },
  budget: { enabled: false },
}

export function parseConstitution(record: any): CommunityConstitution {
  if (!record || typeof record !== 'object') {
    throw new Error('Invalid constitution record')
  }

  const rules: GovernanceRules = {
    ...DEFAULT_RULES,
    ...(record.rules || {}),
  }

  // Validate ranges
  if (rules.quorum !== undefined && (rules.quorum < 0 || rules.quorum > 1)) {
    throw new Error('quorum must be between 0 and 1')
  }
  if (
    rules.approvalThreshold !== undefined &&
    (rules.approvalThreshold < 0 || rules.approvalThreshold > 1)
  ) {
    throw new Error('approvalThreshold must be between 0 and 1')
  }
  if (rules.deliberationDays !== undefined && rules.deliberationDays < 1) {
    throw new Error('deliberationDays must be >= 1')
  }
  if (rules.votingDays !== undefined && rules.votingDays < 1) {
    throw new Error('votingDays must be >= 1')
  }
  if (rules.chamberSize !== undefined && rules.chamberSize < 1) {
    throw new Error('chamberSize must be >= 1')
  }
  if (rules.observerSize !== undefined && rules.observerSize < 1) {
    throw new Error('observerSize must be >= 1')
  }

  return {
    community: record.community as string,
    version: (record.version ?? 1) as number,
    rules,
    createdAt: (record.createdAt ?? new Date().toISOString()) as string,
  }
}

export function getEffectiveRules(
  constitution: CommunityConstitution | undefined,
): GovernanceRules {
  if (!constitution) return DEFAULT_RULES
  return { ...DEFAULT_RULES, ...constitution.rules }
}

/**
 * Check if a proposal can move from deliberation to voting.
 */
export function canStartVoting(
  constitution: CommunityConstitution | undefined,
  proposalCreatedAt: Date,
  now: Date = new Date(),
): boolean {
  const rules = getEffectiveRules(constitution)
  const minDeliberationMs = (rules.deliberationDays ?? 7) * 24 * 60 * 60 * 1000
  return now.getTime() - proposalCreatedAt.getTime() >= minDeliberationMs
}

/**
 * Check if a vote result meets the approval threshold.
 */
export function isApproved(
  constitution: CommunityConstitution | undefined,
  votesFor: number,
  votesAgainst: number,
): boolean {
  const rules = getEffectiveRules(constitution)
  const threshold = rules.approvalThreshold ?? 0.5
  const total = votesFor + votesAgainst
  if (total === 0) return false
  return votesFor / total >= threshold
}

/**
 * Quadratic funding matching calculation.
 * Given a list of contributions, returns the matching amount for each project.
 */
export function quadraticMatching(
  contributions: Array<{ projectId: string; amount: number }>,
  matchingPool: number,
): Array<{ projectId: string; contributions: number; matching: number }> {
  const projectMap = new Map<string, number>()

  for (const c of contributions) {
    const current = projectMap.get(c.projectId) || 0
    projectMap.set(c.projectId, current + Math.sqrt(c.amount))
  }

  const sumOfSquares = Array.from(projectMap.values()).reduce(
    (a, b) => a + b * b,
    0,
  )
  if (sumOfSquares === 0) return []

  return Array.from(projectMap.entries()).map(([projectId, sqrtSum]) => ({
    projectId,
    contributions: sqrtSum * sqrtSum,
    matching: ((sqrtSum * sqrtSum) / sumOfSquares) * matchingPool,
  }))
}
