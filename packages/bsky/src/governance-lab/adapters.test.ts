import { describe, expect, it } from 'vitest'
import {
  type AdapterContext,
  adaptCivicDelegation,
  adaptQvlDelegation,
} from './adapters.js'
import { evaluateElection } from './engine.js'
import { demoElection, demoEvents } from './fixtures.js'

const context: AdapterContext = {
  id: 'demo:adapter',
  election: demoElection.id,
  actor: 'demo:ana',
  sequence: 5,
  acceptedAt: 6000,
  community: demoElection.community,
  expiresAt: demoElection.closesAt,
}

describe('explicit delegation family adapters', () => {
  it('maps both families to the same proposal grant and result', () => {
    const qvl = adaptQvlDelegation(
      {
        delegator: context.actor,
        delegate: 'demo:carla',
        scope: { mode: 'proposal', proposal: 'demo:park' },
      },
      context,
    )
    const civic = adaptCivicDelegation(
      { delegateTo: 'demo:carla', cabildeo: 'demo:park' },
      context,
    )
    expect(qvl).toEqual(civic)
    const events = demoEvents.filter((e) => e.actor !== context.actor)
    expect(evaluateElection(demoElection, [...events, qvl], 7000)).toEqual(
      evaluateElection(demoElection, [...events, civic], 7000),
    )
  })
  it('rejects forged ownership and scope widening', () => {
    expect(() =>
      adaptQvlDelegation(
        {
          delegator: 'demo:bruno',
          delegate: 'demo:carla',
          scope: { mode: 'community', community: context.community },
        },
        context,
      ),
    ).toThrow()
    expect(() =>
      adaptQvlDelegation(
        {
          delegator: context.actor,
          delegate: 'demo:carla',
          scope: { mode: 'community', community: 'demo:other' },
        },
        context,
      ),
    ).toThrow()
    expect(() =>
      adaptQvlDelegation(
        {
          delegator: context.actor,
          delegate: 'demo:carla',
          scope: {
            mode: 'proposal',
            proposal: 'demo:park',
            topic: 'demo:budget',
          },
        },
        context,
      ),
    ).toThrow()
  })
  it('does not invent a representative for passive party rules or multi-topic legacy records', () => {
    expect(() =>
      adaptCivicDelegation(
        { mode: 'passive', delegateTo: 'demo:carla' },
        context,
      ),
    ).toThrow()
    expect(() =>
      adaptCivicDelegation(
        { delegateTo: 'demo:carla', scopeFlairs: ['demo:one', 'demo:two'] },
        context,
      ),
    ).toThrow()
    expect(() =>
      adaptCivicDelegation(
        {
          delegateTo: 'demo:carla',
          cabildeo: 'demo:park',
          scopeFlairs: ['demo:budget'],
        },
        context,
      ),
    ).toThrow()
  })
  it('requires an explicit valid expiry rather than trusting creation timestamps', () => {
    expect(() =>
      adaptQvlDelegation(
        {
          delegator: context.actor,
          delegate: 'demo:carla',
          scope: { mode: 'topic', topic: 'demo:budget' },
          expiresAt: 'invalid',
        },
        context,
      ),
    ).toThrow()
  })
})
