import { describe, expect, it } from 'vitest'
import { signalToChoice } from '../firehose.js'

describe(signalToChoice, () => {
  for (const { signal, expected } of [
    { signal: 3, expected: 'for' },
    { signal: 2, expected: 'for' },
    { signal: 1, expected: 'for' },
    { signal: 0, expected: 'abstain' },
    { signal: -1, expected: 'against' },
    { signal: -2, expected: 'against' },
    { signal: -3, expected: 'against' },
  ]) {
    it(`maps signal ${signal} to ${expected}`, () => {
      expect(signalToChoice(signal)).toBe(expected)
    })
  }

  it('returns null for out-of-range signals', () => {
    expect(signalToChoice(Number.NaN)).toBeNull()
  })
})
