import type {
  DelegationEvent,
  Election,
  ElectionEvent,
  LabSnapshot,
  ProposalResult,
  Resolution,
  Scope,
} from './types.js'

/** A rejected laboratory configuration or candidate state, never a partial tally. */
export class GovernanceLabError extends Error {
  name = 'GovernanceLabError'
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function requireRule(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new GovernanceLabError(code, message)
}

function integer(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max
}

function syntheticId(id: string): boolean {
  return typeof id === 'string' && /^demo:[a-z0-9-]{1,80}$/.test(id)
}

/** Cost of a valid intensity in the versioned laboratory rule. */
export function quadraticCost(signal: number): number {
  requireRule(
    integer(signal, -3, 3),
    'InvalidSignal',
    'Signal must be an integer from -3 to 3',
  )
  return signal ** 2
}

function scopeKey(scope: Scope, election: Election): string {
  requireRule(
    scope && typeof scope === 'object',
    'InvalidScope',
    'Scope is required',
  )
  switch (scope.mode) {
    case 'community':
      return 'community'
    case 'topic':
      requireRule(
        election.proposals.some((p) => p.topic === scope.topic),
        'InvalidScope',
        'Unknown topic',
      )
      return `topic:${scope.topic}`
    case 'proposal':
      requireRule(
        election.proposals.some((p) => p.id === scope.proposal),
        'InvalidScope',
        'Unknown proposal',
      )
      return `proposal:${scope.proposal}`
    default:
      throw new GovernanceLabError('InvalidScope', 'Unsupported scope')
  }
}

function validateElection(election: Election): void {
  requireRule(
    election.mode === 'synthetic' &&
      election.rulesVersion === 'g1-follow-signal-v1',
    'UnsupportedRules',
    'Only the synthetic follow-signal rules are implemented',
  )
  requireRule(
    syntheticId(election.id) && syntheticId(election.community),
    'SyntheticOnly',
    'Use demo identifiers',
  )
  requireRule(
    election.participants.length > 0 &&
      election.participants.length <= 1000 &&
      election.participants.every(syntheticId),
    'InvalidElectorate',
    'Expected 1–1000 synthetic participants',
  )
  requireRule(
    new Set(election.participants).size === election.participants.length,
    'InvalidElectorate',
    'Duplicate participant',
  )
  requireRule(
    election.proposals.length > 0 && election.proposals.length <= 100,
    'InvalidProposals',
    'Expected 1–100 proposals',
  )
  requireRule(
    new Set(election.proposals.map((p) => p.id)).size ===
      election.proposals.length &&
      election.proposals.every(
        (p) => syntheticId(p.id) && syntheticId(p.topic),
      ),
    'InvalidProposals',
    'Unknown or duplicate proposal identifier',
  )
  requireRule(
    integer(election.opensAt, 0, Number.MAX_SAFE_INTEGER) &&
      integer(election.closesAt, election.opensAt + 1, Number.MAX_SAFE_INTEGER),
    'InvalidTime',
    'Invalid election interval',
  )
  requireRule(
    integer(election.creditsPerParticipant, 1, 1000000),
    'InvalidBudget',
    'Invalid credit budget',
  )
  requireRule(
    integer(election.quorumBps, 1, 10000),
    'InvalidQuorum',
    'Quorum must use the fixed electorate',
  )
  requireRule(
    integer(election.maxDelegationDepth, 1, 64),
    'InvalidDepth',
    'Depth must be between 1 and 64',
  )
  requireRule(
    integer(election.publicationMinimum, 2, 1000),
    'InvalidPublication',
    'Publication minimum must be between 2 and 1000',
  )
}

/**
 * Computes one deterministic synthetic snapshot. No account, network, storage or
 * cryptographic proof is used. Throws if the candidate state overspends any
 * individual's budget; callers must retain their previous accepted state.
 */
export function evaluateElection(
  election: Election,
  events: ElectionEvent[],
  asOf: number,
): LabSnapshot {
  validateElection(election)
  requireRule(
    integer(asOf, 0, Number.MAX_SAFE_INTEGER),
    'InvalidTime',
    'Invalid snapshot time',
  )
  requireRule(
    events.length <= 10000,
    'TooManyEvents',
    'Laboratory event limit exceeded',
  )
  const cutoff = Math.min(asOf, election.closesAt)
  const stateAt = Math.min(asOf, election.closesAt - 1)
  const participants = [...election.participants].sort()
  const proposals = [...election.proposals].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )
  const ballots = new Map<string, Map<string, number>>()
  const grants = new Map<string, DelegationEvent>()
  const revoked = new Set<string>()
  const ids = new Set<string>()
  let previousSequence = 0
  let previousTime = election.opensAt
  let revision = 0

  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    requireRule(
      syntheticId(event.id) && !ids.has(event.id),
      'DuplicateEvent',
      'Expected a unique synthetic event identifier',
    )
    ids.add(event.id)
    requireRule(
      integer(event.sequence, previousSequence + 1, Number.MAX_SAFE_INTEGER),
      'InvalidSequence',
      'Sequences must be unique positive integers',
    )
    previousSequence = event.sequence
    requireRule(
      integer(event.acceptedAt, previousTime, election.closesAt - 1),
      'InvalidTime',
      'Receipt time must be monotonic and inside the election interval',
    )
    previousTime = event.acceptedAt
    requireRule(
      event.election === election.id && participants.includes(event.actor),
      'IneligibleActor',
      'Event is outside the election or electorate',
    )
    // @NOTE replay is based on trusted receipt order, never client createdAt.
    if (event.acceptedAt > cutoff) continue
    revision = event.sequence
    switch (event.kind) {
      case 'vote':
      case 'withdraw': {
        requireRule(
          proposals.some((p) => p.id === event.proposal),
          'InvalidProposal',
          'Unknown proposal',
        )
        const own = ballots.get(event.actor) ?? new Map<string, number>()
        if (event.kind === 'withdraw') own.delete(event.proposal)
        else {
          quadraticCost(event.signal)
          own.set(event.proposal, event.signal)
        }
        ballots.set(event.actor, own)
        break
      }
      case 'delegate':
        requireRule(
          participants.includes(event.delegate) &&
            event.delegate !== event.actor,
          'InvalidDelegate',
          'Delegate must be a different eligible participant',
        )
        scopeKey(event.scope, election)
        requireRule(
          integer(
            event.expiresAt,
            event.acceptedAt + 1,
            Number.MAX_SAFE_INTEGER,
          ),
          'InvalidExpiry',
          'An explicit future expiry is required',
        )
        grants.set(event.id, event)
        break
      case 'revoke': {
        const grant = grants.get(event.delegation)
        requireRule(
          grant &&
            grant.actor === event.actor &&
            !revoked.has(event.delegation),
          'InvalidRevocation',
          'Only the grant owner may revoke an existing active grant once',
        )
        revoked.add(event.delegation)
        break
      }
      default:
        throw new GovernanceLabError('InvalidEvent', 'Unknown event kind')
    }
  }

  const active = new Map<string, Map<string, DelegationEvent>>()
  for (const grant of grants.values()) {
    if (revoked.has(grant.id) || grant.expiresAt <= stateAt) continue
    const byScope =
      active.get(grant.actor) ?? new Map<string, DelegationEvent>()
    const key = scopeKey(grant.scope, election)
    requireRule(
      !byScope.has(key),
      'AmbiguousDelegation',
      'Revoke a grant before replacing it in the same scope',
    )
    byScope.set(key, grant)
    active.set(grant.actor, byScope)
  }

  const resolutions: Resolution[] = []
  for (const proposal of proposals) {
    for (const participant of participants) {
      let current = participant
      let depth = 0
      const visited = new Set<string>()
      let status: Resolution['status'] = 'no-vote'
      let source: string | null = null
      let signal: number | null = null
      for (;;) {
        if (visited.has(current)) {
          status = 'cycle'
          break
        }
        visited.add(current)
        const direct = ballots.get(current)?.get(proposal.id)
        if (direct !== undefined) {
          signal = direct
          source = current
          status = depth === 0 ? 'direct' : 'delegated'
          break
        }
        const scopes = active.get(current)
        const grant =
          scopes?.get(`proposal:${proposal.id}`) ??
          scopes?.get(`topic:${proposal.topic}`) ??
          scopes?.get('community')
        if (!grant) break
        if (depth >= election.maxDelegationDepth) {
          status = 'depth-limit'
          break
        }
        current = grant.delegate
        depth++
      }
      resolutions.push({
        participant,
        proposal: proposal.id,
        source,
        signal,
        cost: signal === null ? 0 : quadraticCost(signal),
        depth,
        status,
      })
    }
  }

  const budgets = participants.map((participant) => {
    const spent = resolutions
      .filter((r) => r.participant === participant)
      .reduce((sum, r) => sum + r.cost, 0)
    requireRule(
      spent <= election.creditsPerParticipant,
      'BudgetExceeded',
      `Candidate state exceeds the individual budget for ${participant}`,
    )
    return {
      participant,
      spent,
      remaining: election.creditsPerParticipant - spent,
    }
  })
  const results: ProposalResult[] = proposals.map((proposal) => {
    const rows = resolutions.filter((r) => r.proposal === proposal.id)
    const counted = rows.filter((r) => r.signal !== null)
    const support = counted.filter((r) => r.signal! > 0).length
    const oppose = counted.filter((r) => r.signal! < 0).length
    const quorumTarget = Math.ceil(
      (participants.length * election.quorumBps) / 10000,
    )
    return {
      proposal: proposal.id,
      eligible: participants.length,
      represented: counted.length,
      direct: counted.filter((r) => r.status === 'direct').length,
      delegated: counted.filter((r) => r.status === 'delegated').length,
      unresolved: rows.length - counted.length,
      support,
      oppose,
      abstain: counted.length - support - oppose,
      flatSignalSum: support - oppose,
      intensitySignalSum: counted.reduce((sum, r) => sum + r.signal!, 0),
      creditsSpent: counted.reduce((sum, r) => sum + r.cost, 0),
      quorumTarget,
      quorumMet: counted.length >= quorumTarget,
    }
  })
  const phase =
    asOf < election.opensAt
      ? 'scheduled'
      : asOf < election.closesAt
        ? 'open'
        : 'closed'
  return {
    labOnly: true,
    election: election.id,
    rulesVersion: election.rulesVersion,
    revision,
    cutoff,
    phase,
    resolutions,
    budgets,
    results,
    publication:
      phase !== 'closed'
        ? { state: 'withheld', reason: 'not-closed' }
        : results.some((r) => r.represented < election.publicationMinimum)
          ? { state: 'withheld', reason: 'small-cohort' }
          : {
              state: 'synthetic-final',
              results: results.map((r) => ({ ...r })),
            },
  }
}
