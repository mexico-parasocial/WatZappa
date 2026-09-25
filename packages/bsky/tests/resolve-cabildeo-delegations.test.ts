import { describe, expect, it } from 'vitest'
import { resolveCabildeoDelegations } from '../src/data-plane/server/indexing/plugins/resolve-cabildeo-delegations.js'

const ballot = (person: string, actorDid: string, selectedOption: number) => ({
  nullifier: person,
  actorDid,
  selectedOption,
  indexedAt: '2026-09-24T12:00:00Z',
  uri: `at://${actorDid}/vote/one`,
})
const grant = (
  person: string,
  actorDid: string,
  delegateTo: string,
  mode: 'active' | 'passive' = 'active',
) => ({
  nullifier: person,
  actorDid,
  delegateTo,
  mode,
  indexedAt: '2026-09-24T11:00:00Z',
  uri: `at://${actorDid}/delegation/one`,
})

describe('effective cabildeo tally', () => {
  it('counts a chain once per person and applies sqrt(N) at its terminal voter', () => {
    const tally = resolveCabildeoDelegations(
      2,
      [ballot('c', 'did:c', 1)],
      [grant('a', 'did:a', 'did:b'), grant('b', 'did:b', 'did:c')],
    )
    expect(tally.direct).toBe(1)
    expect(tally.delegated).toBe(2)
    expect(tally.totalParticipants).toBe(3)
    expect(tally.effectivePowerMicros).toEqual([0, 2_414_213])
    expect(tally.winningOption).toBe(1)
  })

  it('direct voting overrides a grant, and cycles without a direct voter abstain', () => {
    const tally = resolveCabildeoDelegations(
      2,
      [ballot('a', 'did:a', 0), ballot('c', 'did:c', 1)],
      [
        grant('a', 'did:a', 'did:b'),
        grant('b', 'did:b', 'did:a'),
        grant('d', 'did:d', 'did:e'),
        grant('e', 'did:e', 'did:d'),
      ],
    )
    expect(tally.effectivePowerMicros).toEqual([2_000_000, 1_000_000])
    expect(tally.delegated).toBe(1)
  })

  it('specific grants beat standing grants and two accounts with one nullifier count once', () => {
    const tally = resolveCabildeoDelegations(
      2,
      [
        ballot('terminal-a', 'did:target-a', 0),
        ballot('terminal-b', 'did:target-b', 1),
      ],
      [
        grant('same-person', 'did:alias-1', 'did:target-b', 'passive'),
        grant('same-person', 'did:alias-2', 'did:target-a', 'active'),
      ],
    )
    expect(tally.direct).toBe(2)
    expect(tally.delegated).toBe(1)
    expect(tally.effectivePowerMicros).toEqual([2_000_000, 1_000_000])
  })

  it('reports an exact tie using fixed-point weights', () => {
    const tally = resolveCabildeoDelegations(
      2,
      [ballot('a', 'did:a', 0), ballot('b', 'did:b', 1)],
      [],
    )
    expect(tally.isTie).toBe(true)
    expect(tally.winningOption).toBeNull()
  })

  it('uses the newest matching passive grant and ignores a delegate who never votes', () => {
    const old = grant('owner', 'did:owner', 'did:missing', 'passive')
    const recent = {
      ...grant('owner', 'did:owner', 'did:voter', 'passive'),
      indexedAt: '2026-09-24T11:30:00Z',
      uri: 'at://did:owner/delegation/two',
    }
    const tally = resolveCabildeoDelegations(
      2,
      [ballot('voter', 'did:voter', 1)],
      [old, recent],
    )
    expect(tally.optionPersonCounts).toEqual([0, 2])
    expect(tally.effectivePowerMicros).toEqual([0, 2_000_000])
    expect(resolveCabildeoDelegations(2, [], [old]).delegated).toBe(0)
  })

  it('resolves a delegate who votes from another account under the same person nullifier', () => {
    const tally = resolveCabildeoDelegations(
      2,
      [ballot('delegate-person', 'did:other-account', 0)],
      [
        grant('owner', 'did:owner', 'did:delegate-account'),
        grant('delegate-person', 'did:delegate-account', 'did:elsewhere'),
      ],
    )
    expect(tally.direct).toBe(1)
    expect(tally.delegated).toBe(1)
    expect(tally.optionPersonCounts).toEqual([2, 0])
  })
})
