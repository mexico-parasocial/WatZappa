/**
 * Decision rules for community-map contributions. Pure on purpose: both
 * database implementations call this instead of embedding thresholds, so the
 * approval policy has exactly one definition and is testable without a
 * database.
 */

export type ContributionDecision = 'approve' | 'reject' | 'pending'

export interface ContributionVoteCounts {
  approve: number
  reject: number
}

/** Minimum votes for the leading side, and minimum margin over the other. */
export const CONTRIBUTION_DECISION_THRESHOLD = 3
export const CONTRIBUTION_DECISION_MARGIN = 2

/**
 * A contribution is decided when one side reaches the threshold AND leads by
 * at least the margin. Ties and low turnout stay pending.
 */
export function decideContribution(
  counts: ContributionVoteCounts,
): ContributionDecision {
  if (
    counts.approve >= CONTRIBUTION_DECISION_THRESHOLD &&
    counts.approve - counts.reject >= CONTRIBUTION_DECISION_MARGIN
  ) {
    return 'approve'
  }
  if (
    counts.reject >= CONTRIBUTION_DECISION_THRESHOLD &&
    counts.reject - counts.approve >= CONTRIBUTION_DECISION_MARGIN
  ) {
    return 'reject'
  }
  return 'pending'
}
