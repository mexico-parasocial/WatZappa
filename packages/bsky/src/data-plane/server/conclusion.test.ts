import { describe, expect, it } from 'vitest'
import { isConcludable, pickConclusions } from './conclusion.js'

describe('isConcludable', () => {
  it('serves forum and persuasion cabildeos once they leave draft', () => {
    for (const kind of ['forum', 'persuasion']) {
      expect(isConcludable({ kind, phase: 'open' }, undefined)).toBe(true)
      expect(isConcludable({ kind, phase: 'resolved' }, 'public')).toBe(true)
      expect(isConcludable({ kind, phase: 'draft' }, undefined)).toBe(false)
    }
  })

  it('never serves an activity, which ends in a vote, or a missing kind', () => {
    expect(isConcludable({ kind: 'activity', phase: 'open' }, undefined)).toBe(
      false,
    )
    expect(isConcludable({ kind: null, phase: 'resolved' }, undefined)).toBe(
      false,
    )
  })

  it('serves only public cabildeos until visibility is tier-aware', () => {
    expect(isConcludable({ kind: 'forum', phase: 'open' }, 'signed_in')).toBe(
      false,
    )
    expect(
      isConcludable({ kind: 'forum', phase: 'open' }, 'community_member'),
    ).toBe(false)
  })
})

describe('pickConclusions', () => {
  const row = (uri: string, createdAt: string) => ({ uri, createdAt })

  it('shows the newest and keeps the rest, newest first', () => {
    const { current, earlier } = pickConclusions([
      row('a', '2026-11-01T00:00:00.000Z'),
      row('c', '2026-11-03T00:00:00.000Z'),
      row('b', '2026-11-02T00:00:00.000Z'),
    ])
    expect(current?.uri).toBe('c')
    expect(earlier.map((r) => r.uri)).toEqual(['b', 'a'])
  })

  it('has nothing to show for no rows', () => {
    expect(pickConclusions([])).toEqual({ current: undefined, earlier: [] })
  })

  it('breaks a tie the same way every time', () => {
    const at = '2026-11-01T00:00:00.000Z'
    const one = pickConclusions([row('a', at), row('b', at)])
    const two = pickConclusions([row('b', at), row('a', at)])
    expect(one.current?.uri).toBe(two.current?.uri)
  })
})
