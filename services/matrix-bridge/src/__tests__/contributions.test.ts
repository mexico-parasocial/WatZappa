import { describe, expect, it } from 'vitest'

import {
  CONTRIBUTION_DECISION_MARGIN,
  CONTRIBUTION_DECISION_THRESHOLD,
  decideContribution,
} from '../contributions.js'

describe('decideContribution()', () => {
  it('stays pending below the threshold', () => {
    expect(decideContribution({ approve: 2, reject: 0 })).toBe('pending')
    expect(decideContribution({ approve: 0, reject: 0 })).toBe('pending')
  })

  it('stays pending when the margin is not met', () => {
    // threshold reached but 3-2 is only a one-vote margin
    expect(decideContribution({ approve: 3, reject: 2 })).toBe('pending')
    expect(decideContribution({ reject: 4, approve: 3 })).toBe('pending')
  })

  it('approves at threshold with margin', () => {
    expect(decideContribution({ approve: 3, reject: 1 })).toBe('approve')
    expect(decideContribution({ approve: 10, reject: 0 })).toBe('approve')
  })

  it('rejects at threshold with margin', () => {
    expect(decideContribution({ reject: 3, approve: 1 })).toBe('reject')
    expect(decideContribution({ reject: 7, approve: 2 })).toBe('reject')
  })

  it('never approves while behind, whatever the totals', () => {
    expect(decideContribution({ approve: 9, reject: 9 })).toBe('pending')
    expect(decideContribution({ approve: 4, reject: 9 })).toBe('reject')
  })

  it('exports the thresholds the docstrings promise', () => {
    expect(CONTRIBUTION_DECISION_THRESHOLD).toBe(3)
    expect(CONTRIBUTION_DECISION_MARGIN).toBe(2)
  })
})
