import { describe, expect, it } from 'vitest'
import { prepareFirehoseCursor, signalToChoice } from '../firehose.js'

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

describe(prepareFirehoseCursor, () => {
  it('binds an empty database to the requested PDS source', async () => {
    let source: string | undefined
    const db = {
      getSyncCursor: async () => undefined,
      getSyncSource: async () => source,
      setSyncSource: async (value: string) => {
        source = value
      },
    }
    expect(await prepareFirehoseCursor(db, 'pds-one')).toBeUndefined()
    expect(source).toBe('pds-one')
  })

  it('refuses a cursor from another source without changing it', async () => {
    let source = 'pds-one'
    const db = {
      getSyncCursor: async () => 1169,
      getSyncSource: async () => source,
      setSyncSource: async (value: string) => {
        source = value
      },
    }
    await expect(prepareFirehoseCursor(db, 'pds-two')).rejects.toThrow(
      'belongs to PDS source',
    )
    expect(source).toBe('pds-one')
    expect(await db.getSyncCursor()).toBe(1169)
  })

  it('refuses a legacy cursor with no known source', async () => {
    const db = {
      getSyncCursor: async () => 1169,
      getSyncSource: async () => undefined,
      setSyncSource: async () => {
        throw new Error('must not claim source')
      },
    }
    await expect(prepareFirehoseCursor(db, 'pds-two')).rejects.toThrow(
      'cursor without a PDS source',
    )
  })
})
