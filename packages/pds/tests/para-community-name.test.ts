import { findCommunityNameConflict } from '../src/api/com/para/community/name-uniqueness'

const board = (name: string, rkey = name) => ({
  uri: `at://did:plc:a/com.para.community.board/${rkey}`,
  name,
})

describe('findCommunityNameConflict', () => {
  it('finds a board with the same name', () => {
    const pan = board('PAN')
    expect(findCommunityNameConflict([board('Morena'), pan], 'PAN')).toBe(pan)
  })

  it('ignores case, accents and punctuation', () => {
    const salud = board('Salud Pública')
    expect(findCommunityNameConflict([salud], 'salud publica')).toBe(salud)
    expect(findCommunityNameConflict([salud], '  SALUD—PÚBLICA ')).toBe(salud)
  })

  it('does not treat a longer or different name as a conflict', () => {
    expect(
      findCommunityNameConflict([board('PAN supporters')], 'PAN'),
    ).toBeUndefined()
    expect(findCommunityNameConflict([board('PAN')], 'PRI')).toBeUndefined()
  })

  it('does not conflict a board with itself (idempotent re-create)', () => {
    const pan = board('PAN', 'mine')
    expect(findCommunityNameConflict([pan], 'PAN', pan.uri)).toBeUndefined()
  })

  it('still conflicts with a different board by the same creator', () => {
    const mine = board('PAN', 'mine')
    const other = board('PAN', 'other')
    expect(findCommunityNameConflict([mine, other], 'PAN', mine.uri)).toBe(
      other,
    )
  })

  it('has no conflict for a name that normalizes to nothing', () => {
    expect(findCommunityNameConflict([board('PAN')], '---')).toBeUndefined()
  })
})
