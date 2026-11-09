/*
 * How an assembly decision is counted, and which decisions an assembly may
 * make. Pure rules, no I/O: the caller gathers the electorate and the ballots
 * and this decides.
 *
 * The rules are fixed here on purpose. A community's governance record is
 * published by its owner, so letting it set the quorum would let an owner veto
 * the very assembly that exists to hold the owner accountable (`owner.recover`).
 */

export type AssemblyPolicy = 'assembly_majority' | 'assembly_supermajority'

/**
 * A cabildeo that carries a `protectedAction` has exactly two options: the
 * first approves the action and the second rejects it.
 */
export const ASSEMBLY_APPROVE_OPTION = 0
export const ASSEMBLY_REJECT_OPTION = 1
export const ASSEMBLY_OPTION_COUNT = 2

/**
 * How long voting must have been open before the result can ground an
 * authority event. Quorum and a threshold cannot stop an author from opening a
 * vote nobody has time to hear about, so the window is fixed here too, like
 * the quorum: a community cannot shorten it.
 */
export const ASSEMBLY_MIN_VOTING_MS = 72 * 60 * 60_000

/** Share of the ballots cast that must approve, as [numerator, denominator]. */
const APPROVAL_SHARE: Record<
  AssemblyPolicy,
  { numerator: number; denominator: number; strict: boolean }
> = {
  // More than half.
  assembly_majority: { numerator: 1, denominator: 2, strict: true },
  // At least two thirds.
  assembly_supermajority: { numerator: 2, denominator: 3, strict: false },
}

/** The community events an assembly decision may stand behind. */
export type AssemblyEventAction =
  'member.activate' | 'owner.grant' | 'owner.revoke'

/**
 * The protected actions an assembly can decide, with the policy that decides
 * each and the events it may produce. Every other protected action is carried
 * out by an officeholder (`resolveAvailableAction`), or by no one yet.
 */
export const ASSEMBLY_DECISIONS: Readonly<
  Record<
    string,
    { policy: AssemblyPolicy; events: readonly AssemblyEventAction[] }
  >
> = Object.freeze({
  'membership.approve': {
    policy: 'assembly_majority',
    events: ['member.activate'],
  },
  'owner.recover': {
    policy: 'assembly_supermajority',
    events: ['owner.grant', 'owner.revoke'],
  },
})

/**
 * Ballots needed for a decision to count: a fifth of the electorate and at
 * least ten, the participation rule of a policy tally, but never more than the
 * electorate itself (a three-member assembly needs all three).
 */
export function assemblyQuorumTarget(electorate: number): number {
  if (electorate <= 0) return 0
  return Math.min(electorate, Math.max(10, Math.ceil(electorate * 0.2)))
}

export type AssemblyOutcome = {
  approved: boolean
  reason: 'approved' | 'no-ballots' | 'quorum-not-met' | 'threshold-not-met'
  electorate: number
  quorumTarget: number
  participants: number
  approvals: number
  rejections: number
}

/**
 * Whether an assembly approved a protected action. `approvals` and
 * `rejections` count distinct eligible members, one ballot each. `minQuorum`
 * is the proposer's own floor and can only raise the bar.
 */
export function evaluateAssemblyVote(input: {
  policy: AssemblyPolicy
  electorate: number
  approvals: number
  rejections: number
  minQuorum?: number | null
}): AssemblyOutcome {
  const { policy, electorate, approvals, rejections } = input
  const participants = approvals + rejections
  const quorumTarget = Math.max(
    assemblyQuorumTarget(electorate),
    input.minQuorum ?? 0,
  )
  const outcome = (reason: AssemblyOutcome['reason']): AssemblyOutcome => ({
    approved: reason === 'approved',
    reason,
    electorate,
    quorumTarget,
    participants,
    approvals,
    rejections,
  })
  if (participants === 0) return outcome('no-ballots')
  if (participants < quorumTarget) return outcome('quorum-not-met')
  const { numerator, denominator, strict } = APPROVAL_SHARE[policy]
  const approving = approvals * denominator
  const required = participants * numerator
  const passes = strict ? approving > required : approving >= required
  return outcome(passes ? 'approved' : 'threshold-not-met')
}
