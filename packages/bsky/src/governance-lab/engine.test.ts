import { describe, expect, it } from 'vitest'
import { evaluateElection } from './engine.js'
import { demoElection, demoEvents } from './fixtures.js'
import type { ElectionEvent } from './types.js'

const park = 'demo:park'
const library = 'demo:library'
const ana = 'demo:ana'
const bruno = 'demo:bruno'
const carla = 'demo:carla'
const diego = 'demo:diego'
function extra(
  payload: Omit<ElectionEvent, 'id' | 'election' | 'sequence' | 'acceptedAt'> &
    Record<string, unknown>,
  sequence = 5,
): ElectionEvent {
  return {
    id: `demo:event-${sequence}`,
    election: demoElection.id,
    sequence,
    acceptedAt: sequence * 1000 + 1000,
    ...payload,
  } as ElectionEvent
}
function run(events = demoEvents, asOf = 50000) {
  return evaluateElection(demoElection, events, asOf)
}

describe('synthetic integrated governance', () => {
  it('resolves A → B → C once per eligible source with individual budgets', () => {
    const result = run()
    expect(
      result.resolutions.find(
        (r) => r.participant === ana && r.proposal === park,
      ),
    ).toMatchObject({
      source: carla,
      signal: 2,
      cost: 4,
      depth: 2,
      status: 'delegated',
    })
    expect(result.budgets).toEqual([
      { participant: ana, spent: 5, remaining: 5 },
      { participant: bruno, spent: 5, remaining: 5 },
      { participant: carla, spent: 5, remaining: 5 },
      { participant: diego, spent: 0, remaining: 10 },
    ])
    expect(result.results.find((r) => r.proposal === park)).toMatchObject({
      eligible: 4,
      represented: 3,
      direct: 1,
      delegated: 2,
      unresolved: 1,
      flatSignalSum: 3,
      intensitySignalSum: 6,
      creditsSpent: 12,
      quorumTarget: 2,
      quorumMet: true,
    })
  })

  it('a direct vote overrides delegation only for its own proposal', () => {
    const result = run([
      ...demoEvents,
      extra({ kind: 'vote', actor: ana, proposal: park, signal: -3 }),
    ])
    expect(result.results.find((r) => r.proposal === park)).toMatchObject({
      represented: 3,
      direct: 2,
      delegated: 1,
      intensitySignalSum: 1,
    })
    expect(result.budgets.find((b) => b.participant === ana)).toMatchObject({
      spent: 10,
      remaining: 0,
    })
    expect(
      result.resolutions.find(
        (r) => r.participant === ana && r.proposal === library,
      )?.source,
    ).toBe(carla)
  })

  it('zero is an explicit abstention, not missing data or a fallback to delegation', () => {
    const result = run([
      ...demoEvents,
      extra({ kind: 'vote', actor: ana, proposal: park, signal: 0 }),
    ])
    expect(
      result.resolutions.find(
        (r) => r.participant === ana && r.proposal === park,
      ),
    ).toMatchObject({ source: ana, signal: 0, cost: 0, status: 'direct' })
    expect(result.results.find((r) => r.proposal === park)?.abstain).toBe(1)
  })

  it('withdrawal restores delegation and recalculates the individual budget', () => {
    const events = [
      ...demoEvents,
      extra({ kind: 'vote', actor: ana, proposal: park, signal: -3 }),
      extra({ kind: 'withdraw', actor: ana, proposal: park }, 6),
    ]
    expect(run(events).budgets).toEqual(run().budgets)
  })

  it('rejects overspending across proposals instead of clamping or accepting a partial result', () => {
    expect(() =>
      run([
        ...demoEvents,
        extra({ kind: 'vote', actor: ana, proposal: park, signal: 3 }),
        extra({ kind: 'vote', actor: ana, proposal: library, signal: 2 }, 6),
      ]),
    ).toThrow(expect.objectContaining({ code: 'BudgetExceeded' }))
  })

  it('rejects a delegate update which would overspend a follower budget', () => {
    const events = [
      ...demoEvents,
      extra({ kind: 'vote', actor: ana, proposal: library, signal: 3 }),
      extra({ kind: 'vote', actor: carla, proposal: park, signal: 2 }, 6),
    ]
    expect(() => run(events)).toThrow(
      expect.objectContaining({ code: 'BudgetExceeded' }),
    )
  })

  it('revocation affects only the grant and does not emit a vote', () => {
    const result = run([
      ...demoEvents,
      extra({ kind: 'revoke', actor: ana, delegation: 'demo:event-4' }),
    ])
    expect(result.budgets.find((b) => b.participant === ana)?.spent).toBe(0)
    expect(result.results.every((r) => r.represented === 2)).toBe(true)
  })

  it('refuses revocation by another actor and unknown grants', () => {
    for (const event of [
      extra({ kind: 'revoke', actor: carla, delegation: 'demo:event-4' }),
      extra({ kind: 'revoke', actor: ana, delegation: 'demo:missing' }),
    ]) {
      expect(() => run([...demoEvents, event])).toThrow(
        expect.objectContaining({ code: 'InvalidRevocation' }),
      )
    }
  })

  it('handles cycles and inbound paths without creating votes', () => {
    const events = demoEvents
      .filter((e) => e.kind === 'delegate')
      .map((e) => ({
        ...e,
        delegate: e.actor === bruno ? ana : bruno,
      })) as ElectionEvent[]
    const result = run(events)
    expect(
      result.resolutions
        .filter((r) => [ana, bruno].includes(r.participant))
        .every((r) => r.status === 'cycle'),
    ).toBe(true)
    expect(
      result.results.every((r) => r.represented === 0 && r.unresolved === 4),
    ).toBe(true)
  })

  it('bounds delegation depth and lets a direct vote terminate the path', () => {
    const result = evaluateElection(
      { ...demoElection, maxDelegationDepth: 1 },
      demoEvents,
      50000,
    )
    expect(
      result.resolutions.find(
        (r) => r.participant === ana && r.proposal === park,
      )?.status,
    ).toBe('depth-limit')
    expect(
      result.resolutions.find(
        (r) => r.participant === bruno && r.proposal === park,
      )?.status,
    ).toBe('delegated')
  })

  it('uses proposal > topic > community precedence with one unit per participant', () => {
    const result = run([
      ...demoEvents,
      extra({ kind: 'vote', actor: diego, proposal: park, signal: -1 }),
      extra(
        {
          kind: 'delegate',
          actor: ana,
          delegate: diego,
          scope: { mode: 'proposal', proposal: park },
          expiresAt: 100000,
        },
        6,
      ),
    ])
    expect(
      result.resolutions.find(
        (r) => r.participant === ana && r.proposal === park,
      )?.source,
    ).toBe(diego)
    expect(
      result.resolutions.find(
        (r) => r.participant === ana && r.proposal === library,
      )?.source,
    ).toBe(carla)
  })

  it('topic grants override community grants without widening a proposal grant', () => {
    const result = run([
      ...demoEvents,
      extra({ kind: 'vote', actor: diego, proposal: park, signal: -1 }),
      extra({ kind: 'vote', actor: diego, proposal: library, signal: -1 }, 6),
      extra(
        {
          kind: 'delegate',
          actor: ana,
          delegate: diego,
          scope: { mode: 'topic', topic: 'demo:budget' },
          expiresAt: 100000,
        },
        7,
      ),
      extra(
        {
          kind: 'delegate',
          actor: ana,
          delegate: carla,
          scope: { mode: 'proposal', proposal: park },
          expiresAt: 100000,
        },
        8,
      ),
    ])
    expect(
      result.resolutions.find(
        (r) => r.participant === ana && r.proposal === park,
      )?.source,
    ).toBe(carla)
    expect(
      result.resolutions.find(
        (r) => r.participant === ana && r.proposal === library,
      )?.source,
    ).toBe(diego)
  })

  it('a direct ballot terminates a cycle for that proposal, not for all proposals', () => {
    const events = [
      extra(
        {
          kind: 'delegate',
          actor: ana,
          delegate: bruno,
          scope: { mode: 'community' },
          expiresAt: 100000,
        },
        1,
      ),
      extra(
        {
          kind: 'delegate',
          actor: bruno,
          delegate: ana,
          scope: { mode: 'community' },
          expiresAt: 100000,
        },
        2,
      ),
      extra({ kind: 'vote', actor: ana, proposal: park, signal: 1 }, 3),
    ]
    expect(
      run(events).results.find((r) => r.proposal === park)?.represented,
    ).toBe(2)
    expect(
      run(events).results.find((r) => r.proposal === library)?.represented,
    ).toBe(0)
  })

  it('keeps the fixed quorum denominator even with zero turnout', () => {
    expect(
      run([]).results.every(
        (r) => r.quorumTarget === 2 && !r.quorumMet && r.eligible === 4,
      ),
    ).toBe(true)
  })

  it('conserves every eligible unit across all 256 four-person grant graphs', () => {
    const people = demoElection.participants
    for (let graph = 0; graph < 256; graph++) {
      let encoded = graph
      const events: ElectionEvent[] = [
        extra({ kind: 'vote', actor: carla, proposal: park, signal: 2 }, 1),
        extra({ kind: 'vote', actor: diego, proposal: park, signal: -1 }, 2),
      ]
      people.forEach((actor, index) => {
        const choice = encoded % 4
        encoded = Math.floor(encoded / 4)
        if (choice === 0) return
        const delegate = people.filter((p) => p !== actor)[choice - 1]
        events.push(
          extra(
            {
              kind: 'delegate',
              actor,
              delegate,
              scope: { mode: 'community' },
              expiresAt: 100000,
            },
            index + 3,
          ),
        )
      })
      const result = run(events)
      const tally = result.results.find((r) => r.proposal === park)!
      expect(tally.represented + tally.unresolved).toBe(4)
      expect(tally.direct).toBe(2)
      expect(
        result.resolutions
          .filter((r) => r.proposal === park && r.source !== null)
          .every((r) => [carla, diego].includes(r.source!)),
      ).toBe(true)
      expect(tally.creditsSpent).toBe(
        result.budgets.reduce((sum, b) => sum + b.spent, 0),
      )
    }
  })

  it('refuses same-scope ambiguity instead of choosing by input array order', () => {
    expect(() =>
      run([
        ...demoEvents,
        extra({
          kind: 'delegate',
          actor: ana,
          delegate: carla,
          scope: { mode: 'community' },
          expiresAt: 100000,
        }),
      ]),
    ).toThrow(expect.objectContaining({ code: 'AmbiguousDelegation' }))
  })

  it('expiry applies at the exact instant and final close freezes the left-limit state', () => {
    const events = demoEvents.map((e) =>
      e.id === 'demo:event-4' ? { ...e, expiresAt: 8000 } : e,
    )
    expect(run(events, 7999).results[0].represented).toBe(3)
    expect(run(events, 8000).results[0].represented).toBe(2)
    expect(run(demoEvents, 100000).results[0].represented).toBe(3)
    expect(run(demoEvents, 100000)).toEqual(run(demoEvents, 200000))
  })

  it('is deterministic, does not mutate inputs, and conserves eligibility', () => {
    const before = JSON.stringify([demoElection, demoEvents])
    const result = run()
    expect(run([...demoEvents].reverse())).toEqual(result)
    expect(
      evaluateElection(
        {
          ...demoElection,
          participants: [...demoElection.participants].reverse(),
          proposals: [...demoElection.proposals].reverse(),
        },
        demoEvents,
        50000,
      ),
    ).toEqual(result)
    for (const row of result.results) {
      expect(row.direct + row.delegated + row.unresolved).toBe(row.eligible)
      expect(row.support + row.oppose + row.abstain).toBe(row.represented)
    }
    expect(JSON.stringify([demoElection, demoEvents])).toBe(before)
  })

  it('withholds statistics until close and below the minimum cohort without returning counts', () => {
    expect(run().publication).toEqual({
      state: 'withheld',
      reason: 'not-closed',
    })
    expect(run([], 100000).publication).toEqual({
      state: 'withheld',
      reason: 'small-cohort',
    })
    const publication = run(demoEvents, 100000).publication
    expect(publication.state).toBe('synthetic-final')
    expect(JSON.stringify(publication)).not.toMatch(
      /demo:ana|demo:bruno|demo:carla|participant|source/,
    )
  })

  it.each([-4, 4, 0.5, NaN, Infinity])(
    'refuses invalid intensity %s',
    (signal) => {
      expect(() =>
        run([
          ...demoEvents,
          extra({ kind: 'vote', actor: ana, proposal: park, signal }),
        ]),
      ).toThrow(expect.objectContaining({ code: 'InvalidSignal' }))
    },
  )

  it('refuses replay, sequence collision, foreign elections, outsiders and self-delegation', () => {
    const invalid = [
      [...demoEvents, demoEvents[0]],
      [...demoEvents, { ...demoEvents[0], id: 'demo:other' }],
      [{ ...demoEvents[0], election: 'demo:other' }],
      [{ ...demoEvents[0], actor: 'demo:outsider' }],
      [
        extra({
          kind: 'delegate',
          actor: ana,
          delegate: ana,
          scope: { mode: 'community' },
          expiresAt: 100000,
        }),
      ],
    ]
    for (const events of invalid) expect(() => run(events)).toThrow()
  })

  it('refuses late or backdated ledger entries and unknown scopes', () => {
    expect(() => run([{ ...demoEvents[0], acceptedAt: 100000 }])).toThrow()
    expect(() =>
      run([demoEvents[0], { ...demoEvents[1], acceptedAt: 1000 }]),
    ).toThrow()
    expect(() =>
      run([
        extra({
          kind: 'delegate',
          actor: ana,
          delegate: carla,
          scope: { mode: 'topic', topic: 'demo:unknown' },
          expiresAt: 100000,
        }),
      ]),
    ).toThrow()
  })

  it('requires the laboratory mode and synthetic electorate identifiers', () => {
    expect(() =>
      evaluateElection(
        { ...demoElection, participants: ['did:plc:real'] },
        [],
        50000,
      ),
    ).toThrow()
    expect(() =>
      evaluateElection(
        { ...demoElection, mode: 'production' as 'synthetic' },
        [],
        50000,
      ),
    ).toThrow()
    expect(() =>
      evaluateElection(
        { ...demoElection, participants: [ana, ana] },
        [],
        50000,
      ),
    ).toThrow()
  })
})
