import { describe, expect, it } from 'vitest'
import {
  type FollowItem,
  type FollowUpdate,
  type FollowableCabildeo,
  buildFollowThroughTree,
  deriveOwnState,
  isFollowable,
  summarizeFollowThrough,
} from './follow-through.js'

const NOW = new Date('2026-11-02T12:00:00.000Z')
const CABILDEO = 'at://did:plc:alice/com.para.civic.cabildeo/1'
const BOARD = 'at://did:plc:alice/com.para.community.board/1'

const item = (id: string, overrides: Partial<FollowItem> = {}): FollowItem => ({
  uri: `at://did:plc:alice/com.para.civic.followThrough/${id}`,
  cid: 'cid',
  author: 'did:plc:alice',
  cabildeo: CABILDEO,
  communityUri: BOARD,
  optionIndex: 0,
  parent: null,
  title: `Compromiso ${id}`,
  summary: null,
  responsibleDid: null,
  responsibleLabel: null,
  dueAt: null,
  edited: false,
  createdAt: `2026-10-0${id.length}T00:00:00.000Z`,
  ...overrides,
})

let counter = 0
const update = (
  subject: FollowItem,
  overrides: Partial<FollowUpdate> = {},
): FollowUpdate => ({
  uri: `at://did:plc:alice/com.para.civic.followThroughUpdate/${++counter}`,
  author: 'did:plc:alice',
  subject: subject.uri,
  status: 'in_progress',
  progress: null,
  note: null,
  evidenceUris: [],
  dueAt: null,
  edited: false,
  occurredAt: `2026-10-10T00:${String(counter).padStart(2, '0')}:00.000Z`,
  createdAt: `2026-10-10T00:${String(counter).padStart(2, '0')}:00.000Z`,
  ...overrides,
})

const tree = (items: FollowItem[], updates: FollowUpdate[] = []) =>
  buildFollowThroughTree(items, updates, { now: NOW, includeUpdates: false })

describe('isFollowable', () => {
  const resolved: FollowableCabildeo = {
    kind: null,
    phase: 'resolved',
    winningOption: 1,
    isTie: 0,
    voteCount: 10,
    minQuorum: null,
  }

  it('follows a resolved activity with a single winner', () => {
    expect(isFollowable(resolved, undefined)).toBe(true)
    expect(isFollowable({ ...resolved, kind: 'activity' }, 'public')).toBe(true)
  })

  it('treats a winning option of zero as a winner', () => {
    expect(isFollowable({ ...resolved, winningOption: 0 }, undefined)).toBe(
      true,
    )
  })

  it.each([
    ['persuasion', { kind: 'persuasion' }],
    ['forum', { kind: 'forum' }],
    ['unresolved', { phase: 'voting' }],
    ['tied', { isTie: 1 as const }],
    ['no winner', { winningOption: null }],
  ])('does not follow a %s cabildeo', (_name, overrides) => {
    expect(isFollowable({ ...resolved, ...overrides }, undefined)).toBe(false)
  })

  it('requires quorum when one is set', () => {
    const quorate = { ...resolved, minQuorum: 10, voteCount: 10 }
    expect(isFollowable(quorate, undefined)).toBe(true)
    expect(isFollowable({ ...quorate, voteCount: 9 }, undefined)).toBe(false)
  })

  it('serves only the public view tier until tiers are checked', () => {
    expect(isFollowable(resolved, 'community_member')).toBe(false)
    expect(isFollowable(resolved, 'verified_human')).toBe(false)
  })
})

describe('deriveOwnState', () => {
  it('starts planned at zero', () => {
    expect(deriveOwnState(item('a'), [])).toMatchObject({
      status: 'planned',
      progress: 0,
      rescheduledCount: 0,
    })
  })

  it('takes the newest update by when it happened, not by when it was written', () => {
    const a = item('a')
    const earlier = update(a, {
      status: 'completed',
      occurredAt: '2026-10-01T00:00:00.000Z',
      createdAt: '2026-10-30T00:00:00.000Z',
    })
    const later = update(a, {
      status: 'blocked',
      note: 'sin presupuesto',
      occurredAt: '2026-10-20T00:00:00.000Z',
      createdAt: '2026-10-21T00:00:00.000Z',
    })
    expect(deriveOwnState(a, [later, earlier]).status).toBe('blocked')
  })

  it('keeps declared progress across an update that only adds a note', () => {
    const a = item('a')
    const state = deriveOwnState(a, [
      update(a, { progress: 40 }),
      update(a, { note: 'reunión con la alcaldía' }),
    ])
    expect(state).toMatchObject({ status: 'in_progress', progress: 40 })
  })

  it('does not invent progress for work that is under way', () => {
    const a = item('a')
    expect(deriveOwnState(a, [update(a)]).progress).toBeUndefined()
  })

  it('shows completed as 100 and abandoned as none', () => {
    const a = item('a')
    expect(
      deriveOwnState(a, [update(a, { status: 'completed', progress: 70 })])
        .progress,
    ).toBe(100)
    expect(
      deriveOwnState(a, [
        update(a, { progress: 30 }),
        update(a, { status: 'abandoned', note: 'se canceló' }),
      ]).progress,
    ).toBeUndefined()
  })

  it('counts a changed due date as a reschedule, but not the first one set', () => {
    const dated = item('a', { dueAt: '2026-11-01T00:00:00.000Z' })
    const state = deriveOwnState(dated, [
      update(dated, { dueAt: '2026-12-01T00:00:00.000Z', note: 'prórroga' }),
      update(dated, { dueAt: '2026-12-01T00:00:00.000Z', note: 'igual' }),
      update(dated, { dueAt: '2027-01-15T00:00:00.000Z', note: 'otra' }),
    ])
    expect(state.rescheduledCount).toBe(2)
    expect(state.currentDueAt).toBe('2027-01-15T00:00:00.000Z')

    const undated = item('b')
    expect(
      deriveOwnState(undated, [
        update(undated, { dueAt: '2026-12-01T00:00:00.000Z', note: 'fecha' }),
      ]).rescheduledCount,
    ).toBe(0)
  })
})

describe('buildFollowThroughTree', () => {
  it('derives overdue from the current due date only', () => {
    const late = item('a', { dueAt: '2026-10-15T00:00:00.000Z' })
    const extended = item('bb', { dueAt: '2026-10-15T00:00:00.000Z' })
    const done = item('ccc', { dueAt: '2026-10-15T00:00:00.000Z' })
    const noDate = item('dddd')
    const views = tree(
      [late, extended, done, noDate],
      [
        update(extended, {
          dueAt: '2026-12-01T00:00:00.000Z',
          note: 'prórroga',
        }),
        update(done, { status: 'completed' }),
      ],
    )
    const overdue = Object.fromEntries(views.map((v) => [v.title, v.overdue]))
    expect(overdue).toEqual({
      'Compromiso a': true,
      'Compromiso bb': false,
      'Compromiso ccc': false,
      'Compromiso dddd': false,
    })
  })

  it('rolls a parent up from its children and ignores its own updates', () => {
    const parent = item('a')
    const done = item('bb', { parent: parent.uri })
    const half = item('ccc', { parent: parent.uri })
    const [view] = tree(
      [parent, done, half],
      [
        update(done, { status: 'completed' }),
        update(half, { progress: 50 }),
        update(parent, { status: 'completed', progress: 100 }),
      ],
    )
    expect(view).toMatchObject({ status: 'in_progress', progress: 75 })
    expect(view.children).toHaveLength(2)
  })

  it('leaves a parent complete only when every active child is', () => {
    const parent = item('a')
    const one = item('bb', { parent: parent.uri })
    const two = item('ccc', { parent: parent.uri })
    const gone = item('dddd', { parent: parent.uri })
    const [view] = tree(
      [parent, one, two, gone],
      [
        update(one, { status: 'completed' }),
        update(two, { status: 'completed' }),
        update(gone, { status: 'abandoned', note: 'ya no aplica' }),
      ],
    )
    expect(view).toMatchObject({ status: 'completed', progress: 100 })
  })

  it('omits parent progress when a child has none to determine', () => {
    const parent = item('a')
    const known = item('bb', { parent: parent.uri })
    const unknown = item('ccc', { parent: parent.uri })
    const [view] = tree(
      [parent, known, unknown],
      [update(known, { status: 'completed' }), update(unknown)],
    )
    expect(view.status).toBe('in_progress')
    expect(view.progress).toBeUndefined()
  })

  it('shows a parent whose children are all abandoned as abandoned', () => {
    const parent = item('a')
    const kid = item('bb', { parent: parent.uri })
    const [view] = tree(
      [parent, kid],
      [update(kid, { status: 'abandoned', note: 'cancelado' })],
    )
    expect(view.status).toBe('abandoned')
    expect(view.progress).toBeUndefined()
  })

  it('serves one level of nesting and drops anything deeper or orphaned', () => {
    const root = item('a')
    const child = item('bb', { parent: root.uri })
    const grandchild = item('ccc', { parent: child.uri })
    const orphan = item('dddd', { parent: 'at://did:plc:alice/x/missing' })
    const views = tree([root, child, grandchild, orphan])
    expect(views).toHaveLength(1)
    expect(views[0].children?.map((c) => c.title)).toEqual(['Compromiso bb'])
  })

  it('carries edited and withdrawn markers and the timeline when asked', () => {
    const edited = item('a', { edited: true })
    const note = update(edited, { note: 'visita', edited: true })
    const [view] = buildFollowThroughTree([edited], [note], {
      now: NOW,
      includeUpdates: true,
      withdrawn: new Map([[edited.uri, 2]]),
    })
    expect(view.edited).toBe(true)
    expect(view.withdrawnUpdates).toBe(2)
    expect(view.updates).toEqual([
      expect.objectContaining({ note: 'visita', edited: true }),
    ])
    expect(tree([edited], [note])[0].updates).toBeUndefined()
  })
})

describe('summarizeFollowThrough', () => {
  it('counts top-level compromisos and finds the next due date', () => {
    const done = item('a', { dueAt: '2026-09-01T00:00:00.000Z' })
    const late = item('bb', { dueAt: '2026-10-01T00:00:00.000Z' })
    const soon = item('ccc', { dueAt: '2026-12-01T00:00:00.000Z' })
    const gone = item('dddd')
    const roots = tree(
      [done, late, soon, gone],
      [
        update(done, { status: 'completed' }),
        update(gone, { status: 'abandoned', note: 'no aplica' }),
      ],
    )
    expect(summarizeFollowThrough(CABILDEO, roots)).toEqual({
      cabildeo: CABILDEO,
      total: 4,
      completed: 1,
      overdue: 1,
      abandoned: 1,
      progress: 33,
      nextDueAt: '2026-10-01T00:00:00.000Z',
      lastUpdateAt: expect.any(String),
    })
  })

  it('reports progress only when every active compromiso has one', () => {
    const a = item('a')
    const b = item('bb')
    const withBoth = tree([a, b], [update(a, { status: 'completed' })])
    expect(summarizeFollowThrough(CABILDEO, withBoth).progress).toBe(50)
    const unknown = tree([a, b], [update(b)])
    expect(summarizeFollowThrough(CABILDEO, unknown).progress).toBeUndefined()
  })
})
