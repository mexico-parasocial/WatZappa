import {
  type CommunityEvent,
  type CommunityMember,
  type CommunityOffer,
  type CommunityPatch,
  type CommunitySettings,
  type CommunityStateView,
  activeCommunityOffices,
  applyCommunityEvent,
  describeCommunityActions,
  prepareCommunityEvent,
} from './community-policy.js'

const DAY = 24 * 60 * 60 * 1000
const t0 = Date.parse('2026-11-04T12:00:00.000Z')
const owner = 'did:plc:owner'
const mod = 'did:plc:mod'
const member = 'did:plc:member'
const outsider = 'did:plc:outsider'

/** A store that applies patches in memory, like the PDS and AppView do. */
class State implements CommunityStateView {
  settings: CommunitySettings | null = null
  lastSeq = 0
  members = new Map<string, CommunityMember>()
  offers = new Map<number, CommunityOffer>()

  member(did: string) {
    return this.members.get(did)
  }
  openOffer(seq: number) {
    return this.offers.get(seq)
  }
  ownerCount() {
    return [...this.members.values()].filter(
      (m) => m.status === 'active' && m.offices.includes('owner'),
    ).length
  }
  apply(patch: CommunityPatch, seq: number) {
    for (const [did, m] of patch.members) this.members.set(did, m)
    for (const offer of patch.openedOffers) this.offers.set(offer.seq, offer)
    for (const seq of patch.closedOffers) this.offers.delete(seq)
    if (patch.settings) this.settings = patch.settings
    this.lastSeq = seq
  }

  /** Prepares, decides and, if accepted, applies the next event. */
  act(
    input: Omit<Parameters<typeof prepareCommunityEvent>[0], 'seq' | 'createdAt'> & {
      at?: number
    },
  ) {
    const event = prepareCommunityEvent({
      ...input,
      seq: this.lastSeq + 1,
      createdAt: new Date(input.at ?? t0).toISOString(),
    })
    const decision = applyCommunityEvent(this, event)
    if (decision.ok) this.apply(decision.patch, event.seq)
    return { event, decision }
  }
}

const hierarchical: CommunitySettings = {
  governanceMode: 'hierarchical',
  admissionMode: 'open',
}

function founded() {
  const state = new State()
  state.act({
    action: 'community.found',
    actor: owner,
    subject: owner,
    settings: hierarchical,
  })
  for (const did of [mod, member]) {
    state.act({ action: 'member.join', actor: did, subject: did })
  }
  const { event } = state.act({
    action: 'moderator.offer',
    actor: owner,
    subject: mod,
  })
  state.act({
    action: 'moderator.accept',
    actor: mod,
    subject: mod,
    offer: event.seq,
  })
  return state
}

const codeOf = (result: ReturnType<State['act']>) =>
  result.decision.ok ? 'ok' : result.decision.code

describe('community policy', () => {
  it('founds only hierarchical communities with open admission', () => {
    for (const settings of [
      { governanceMode: 'horizontal', admissionMode: 'open' },
      { governanceMode: 'hierarchical', admissionMode: 'assembly_approval' },
    ] as const) {
      const state = new State()
      expect(
        codeOf(
          state.act({
            action: 'community.found',
            actor: owner,
            subject: owner,
            settings,
          }),
        ),
      ).toBe('ModeUnavailable')
    }
    const state = founded()
    expect(state.member(owner)?.offices).toEqual(['owner'])
    expect(state.member(mod)?.offices).toEqual(['moderator'])
  })

  it('refuses events out of sequence', () => {
    const state = founded()
    const event: CommunityEvent = {
      seq: state.lastSeq + 2,
      action: 'member.join',
      actor: outsider,
      subject: outsider,
      createdAt: new Date(t0).toISOString(),
    }
    expect(applyCommunityEvent(state, event)).toMatchObject({
      ok: false,
      code: 'OutOfSequence',
    })
  })

  it('lets only the member join or leave, and keeps the last owner', () => {
    const state = founded()
    expect(
      codeOf(state.act({ action: 'member.join', actor: owner, subject: outsider })),
    ).toBe('NotPermitted')
    expect(
      codeOf(state.act({ action: 'member.leave', actor: owner, subject: owner })),
    ).toBe('LastOwner')
  })

  it('ends offices on leaving, and does not restore them on rejoining', () => {
    const state = founded()
    state.act({ action: 'member.leave', actor: mod, subject: mod })
    expect(state.member(mod)).toMatchObject({ status: 'left', offices: [] })
    state.act({ action: 'member.join', actor: mod, subject: mod })
    expect(state.member(mod)).toMatchObject({ status: 'active', offices: [] })
  })

  it('needs an open, unexpired offer from a current owner', () => {
    const state = founded()
    expect(
      codeOf(
        state.act({ action: 'moderator.offer', actor: mod, subject: member }),
      ),
    ).toBe('NotPermitted')
    // Accepting without an offer, or someone else's offer.
    expect(
      codeOf(
        state.act({
          action: 'moderator.accept',
          actor: member,
          subject: member,
          offer: 999,
        }),
      ),
    ).toBe('InvalidOffer')
    const { event } = state.act({
      action: 'moderator.offer',
      actor: owner,
      subject: member,
    })
    expect(
      codeOf(
        state.act({
          action: 'moderator.accept',
          actor: member,
          subject: member,
          offer: event.seq,
          at: t0 + 15 * DAY,
        }),
      ),
    ).toBe('InvalidOffer')
    expect(
      codeOf(
        state.act({
          action: 'moderator.accept',
          actor: member,
          subject: member,
          offer: event.seq,
          at: t0 + 13 * DAY,
        }),
      ),
    ).toBe('ok')
    // An accepted offer cannot be used twice.
    state.act({ action: 'moderator.resign', actor: member, subject: member })
    expect(
      codeOf(
        state.act({
          action: 'moderator.accept',
          actor: member,
          subject: member,
          offer: event.seq,
        }),
      ),
    ).toBe('InvalidOffer')
  })

  it('refuses an offer whose expiry is not the fixed period', () => {
    const state = founded()
    const event = prepareCommunityEvent({
      seq: state.lastSeq + 1,
      action: 'moderator.offer',
      actor: owner,
      subject: member,
      createdAt: new Date(t0).toISOString(),
    })
    event.expiresAt = new Date(t0 + 365 * DAY).toISOString()
    expect(applyCommunityEvent(state, event)).toMatchObject({
      code: 'InvalidExpiry',
    })
  })

  it('revokes and resigns only a moderator, by the right actor', () => {
    const state = founded()
    expect(
      codeOf(state.act({ action: 'moderator.revoke', actor: mod, subject: mod })),
    ).toBe('NotPermitted')
    expect(
      codeOf(
        state.act({ action: 'moderator.resign', actor: owner, subject: mod }),
      ),
    ).toBe('NotPermitted')
    expect(
      codeOf(
        state.act({ action: 'moderator.revoke', actor: owner, subject: mod }),
      ),
    ).toBe('ok')
    expect(state.member(mod)?.offices).toEqual([])
  })

  it('suspends for at most 7 days, and the suspension ends by itself', () => {
    const state = founded()
    expect(
      codeOf(
        state.act({
          action: 'member.suspend',
          actor: mod,
          subject: member,
          suspensionDays: 8,
        }),
      ),
    ).toBe('InvalidExpiry')
    expect(
      codeOf(
        state.act({
          action: 'member.suspend',
          actor: member,
          subject: mod,
          suspensionDays: 1,
        }),
      ),
    ).toBe('NotPermitted')
    expect(
      codeOf(
        state.act({
          action: 'member.suspend',
          actor: mod,
          subject: owner,
          suspensionDays: 1,
        }),
      ),
    ).toBe('InvalidSubject')
    expect(
      codeOf(
        state.act({
          action: 'member.suspend',
          actor: mod,
          subject: member,
          suspensionDays: 2,
        }),
      ),
    ).toBe('ok')
    expect(
      codeOf(state.act({ action: 'member.leave', actor: member, subject: member })),
    ).toBe('InvalidSubject')
    expect(
      codeOf(
        state.act({
          action: 'member.leave',
          actor: member,
          subject: member,
          at: t0 + 3 * DAY,
        }),
      ),
    ).toBe('ok')
  })

  it('takes away a suspended moderator’s powers until reinstated', () => {
    const state = founded()
    expect(
      codeOf(
        state.act({
          action: 'member.suspend',
          actor: mod,
          subject: mod,
          suspensionDays: 1,
        }),
      ),
    ).toBe('InvalidSubject')
    state.act({
      action: 'member.suspend',
      actor: owner,
      subject: mod,
      suspensionDays: 7,
    })
    expect(activeCommunityOffices(state.member(mod), t0)).toEqual([])
    expect(
      codeOf(
        state.act({
          action: 'member.suspend',
          actor: mod,
          subject: member,
          suspensionDays: 1,
        }),
      ),
    ).toBe('NotPermitted')
    state.act({ action: 'member.reinstate', actor: owner, subject: mod })
    expect(activeCommunityOffices(state.member(mod), t0)).toEqual(['moderator'])
  })

  it('describes only what the policy can do', () => {
    const actions = describeCommunityActions(hierarchical)
    expect(actions.map((a) => a.action).sort()).toEqual(
      [
        'member.join',
        'member.leave',
        'member.reinstate',
        'member.suspend',
        'moderator.accept',
        'moderator.offer',
        'moderator.resign',
        'moderator.revoke',
      ].sort(),
    )
    expect(actions.every((a) => a.available)).toBe(true)
  })
})
