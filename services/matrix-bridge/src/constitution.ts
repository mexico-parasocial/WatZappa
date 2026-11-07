/**
 * Constitution as Code — Programmable Governance for PARA Communities
 *
 * Each community defines its rules as an AT Protocol record. The bridge
 * validates and stores the latest version and serves it (`GET /api/constitution`);
 * it does not decide anything from it. Proposals, votes and their outcomes are
 * cabildeos, tallied by the AppView.
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
