import type { Election, ElectionEvent } from './types.js'

/** Synthetic contract shared by the reference tests and the local browser lab. */
export const demoElection: Election = {
  mode: 'synthetic',
  rulesVersion: 'g1-follow-signal-v1',
  id: 'demo:election',
  community: 'demo:community',
  participants: ['demo:ana', 'demo:bruno', 'demo:carla', 'demo:diego'],
  proposals: [
    { id: 'demo:park', topic: 'demo:budget', label: 'Recuperar el parque' },
    {
      id: 'demo:library',
      topic: 'demo:budget',
      label: 'Ampliar la biblioteca',
    },
  ],
  opensAt: 1000,
  closesAt: 100000,
  creditsPerParticipant: 10,
  quorumBps: 5000,
  maxDelegationDepth: 8,
  publicationMinimum: 3,
}

export const demoEvents: ElectionEvent[] = [
  {
    id: 'demo:event-1',
    election: 'demo:election',
    actor: 'demo:carla',
    sequence: 1,
    acceptedAt: 2000,
    kind: 'vote',
    proposal: 'demo:park',
    signal: 2,
  },
  {
    id: 'demo:event-2',
    election: 'demo:election',
    actor: 'demo:carla',
    sequence: 2,
    acceptedAt: 3000,
    kind: 'vote',
    proposal: 'demo:library',
    signal: 1,
  },
  {
    id: 'demo:event-3',
    election: 'demo:election',
    actor: 'demo:bruno',
    sequence: 3,
    acceptedAt: 4000,
    kind: 'delegate',
    delegate: 'demo:carla',
    scope: { mode: 'community' },
    expiresAt: 100000,
  },
  {
    id: 'demo:event-4',
    election: 'demo:election',
    actor: 'demo:ana',
    sequence: 4,
    acceptedAt: 5000,
    kind: 'delegate',
    delegate: 'demo:bruno',
    scope: { mode: 'community' },
    expiresAt: 100000,
  },
]
