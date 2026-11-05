import {
  COMMUNITY_ACTIONS,
  type CommunityEvent,
  type CommunityMember,
  type CommunityOffer,
  type CommunityPatch,
  type CommunitySettings,
  type CommunityStateView,
  activeCommunityOffices,
  applyCommunityEvent,
  communityRequestMismatch,
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
  community = 'did:plc:community'
  settings: CommunitySettings | null = null
  lastSeq = 0
  members = new Map<string, CommunityMember>()
  offers = new Map<number, CommunityOffer>()
  effects: CommunityPatch['effects'] = []

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
    this.effects.push(...patch.effects)
    if (patch.settings) this.settings = patch.settings
    this.lastSeq = seq
  }

  /** Prepares, decides and, if accepted, applies the next event. */
  act(
    input: Omit<
      Parameters<typeof prepareCommunityEvent>[0],
      'seq' | 'createdAt'
    > & {
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
      codeOf(
        state.act({ action: 'member.join', actor: owner, subject: outsider }),
      ),
    ).toBe('NotPermitted')
    expect(
      codeOf(
        state.act({ action: 'member.leave', actor: owner, subject: owner }),
      ),
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
      codeOf(
        state.act({ action: 'moderator.revoke', actor: mod, subject: mod }),
      ),
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
      codeOf(
        state.act({ action: 'member.leave', actor: member, subject: member }),
      ),
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
      COMMUNITY_ACTIONS.filter((a) => a !== 'community.found').sort(),
    )
    expect(actions.every((a) => a.available)).toBe(true)
    const closed = describeCommunityActions({
      governanceMode: 'hierarchical',
      admissionMode: 'assembly_approval',
    })
    expect(closed.filter((a) => !a.available).map((a) => a.action)).toEqual([
      'member.join',
    ])
  })

  it('matches a request only to the action it names, while valid', () => {
    const community = 'did:plc:community'
    const event = prepareCommunityEvent({
      seq: 9,
      action: 'member.suspend',
      actor: mod,
      subject: member,
      createdAt: new Date(t0).toISOString(),
      suspensionDays: 3,
    })
    const request = {
      community,
      action: 'member.suspend',
      subject: member,
      suspensionDays: 3,
      createdAt: new Date(t0 - 1000).toISOString(),
      expiresAt: new Date(t0 + 1000).toISOString(),
    }
    expect(communityRequestMismatch(community, request, event)).toBeNull()
    for (const changed of [
      { ...request, community: 'did:plc:other' },
      { ...request, subject: outsider },
      { ...request, suspensionDays: 7 },
      { ...request, expiresAt: new Date(t0).toISOString() },
      { ...request, expiresAt: new Date(t0 + 2 * DAY).toISOString() },
    ]) {
      expect(communityRequestMismatch(community, changed, event)).not.toBeNull()
    }
  })

  describe('phase 4', () => {
    const share = (did: string) =>
      `at://${did}/com.para.community.sharedContent/3k`
    const draft = (did: string) =>
      `at://${did}/com.para.community.briefingPack/3k`

    it('removes without blocking, so a removed member may join again', () => {
      const state = founded()
      expect(
        codeOf(
          state.act({ action: 'member.remove', actor: mod, subject: member }),
        ),
      ).toBe('NotPermitted')
      expect(
        codeOf(
          state.act({ action: 'member.remove', actor: owner, subject: owner }),
        ),
      ).toBe('InvalidSubject')
      expect(
        codeOf(
          state.act({
            action: 'member.remove',
            actor: owner,
            subject: outsider,
          }),
        ),
      ).toBe('InvalidSubject')
      expect(
        codeOf(
          state.act({ action: 'member.remove', actor: owner, subject: mod }),
        ),
      ).toBe('ok')
      expect(state.member(mod)).toMatchObject({
        status: 'removed',
        offices: [],
      })
      expect(
        codeOf(state.act({ action: 'member.join', actor: mod, subject: mod })),
      ).toBe('ok')
      // Rejoining brings back no office.
      expect(state.member(mod)?.offices).toEqual([])
    })

    it('blocks until an owner unblocks, even someone who never joined', () => {
      const state = founded()
      expect(
        codeOf(
          state.act({
            action: 'member.block',
            actor: owner,
            subject: outsider,
          }),
        ),
      ).toBe('ok')
      expect(
        codeOf(
          state.act({
            action: 'member.join',
            actor: outsider,
            subject: outsider,
          }),
        ),
      ).toBe('NotPermitted')
      expect(
        codeOf(
          state.act({
            action: 'member.block',
            actor: owner,
            subject: outsider,
          }),
        ),
      ).toBe('InvalidSubject')
      expect(
        codeOf(
          state.act({
            action: 'member.unblock',
            actor: mod,
            subject: outsider,
          }),
        ),
      ).toBe('NotPermitted')
      expect(
        codeOf(
          state.act({
            action: 'member.unblock',
            actor: owner,
            subject: outsider,
          }),
        ),
      ).toBe('ok')
      // Unblocking restores the right to join, not membership.
      expect(state.member(outsider)?.status).toBe('left')
      expect(
        codeOf(
          state.act({
            action: 'member.join',
            actor: outsider,
            subject: outsider,
          }),
        ),
      ).toBe('ok')
      expect(
        codeOf(
          state.act({
            action: 'member.unblock',
            actor: owner,
            subject: member,
          }),
        ),
      ).toBe('InvalidSubject')
    })

    it('lets a moderator propose and an owner decide, directly or on the proposal', () => {
      const state = founded()
      expect(
        codeOf(
          state.act({
            action: 'sanction.propose',
            actor: owner,
            subject: member,
            sanction: 'remove',
          }),
        ),
      ).toBe('NotPermitted')
      expect(
        codeOf(
          state.act({
            action: 'sanction.propose',
            actor: mod,
            subject: member,
          }),
        ),
      ).toBe('InvalidTarget')
      expect(
        codeOf(
          state.act({
            action: 'sanction.propose',
            actor: mod,
            subject: owner,
            sanction: 'block',
          }),
        ),
      ).toBe('InvalidSubject')
      const { event } = state.act({
        action: 'sanction.propose',
        actor: mod,
        subject: member,
        sanction: 'block',
      })
      expect(state.offers.get(event.seq)).toMatchObject({
        office: 'block',
        subject: member,
        issuer: mod,
      })
      // A proposal to block cannot back a removal, or name another subject.
      expect(
        codeOf(
          state.act({
            action: 'member.remove',
            actor: owner,
            subject: member,
            offer: event.seq,
          }),
        ),
      ).toBe('InvalidOffer')
      expect(
        codeOf(
          state.act({
            action: 'member.block',
            actor: owner,
            subject: member,
            offer: event.seq,
            at: t0 + 15 * DAY,
          }),
        ),
      ).toBe('InvalidOffer')
      expect(
        codeOf(
          state.act({
            action: 'member.block',
            actor: owner,
            subject: member,
            offer: event.seq,
          }),
        ),
      ).toBe('ok')
      expect(state.member(member)?.status).toBe('blocked')
      expect(state.offers.has(event.seq)).toBe(false)
    })

    it('transfers ownership by offer, acceptance and resignation', () => {
      const state = founded()
      expect(
        codeOf(
          state.act({ action: 'owner.offer', actor: mod, subject: member }),
        ),
      ).toBe('NotPermitted')
      expect(
        codeOf(
          state.act({ action: 'owner.offer', actor: owner, subject: outsider }),
        ),
      ).toBe('InvalidSubject')
      expect(
        codeOf(
          state.act({ action: 'owner.resign', actor: owner, subject: owner }),
        ),
      ).toBe('LastOwner')
      const { event } = state.act({
        action: 'owner.offer',
        actor: owner,
        subject: mod,
      })
      // A moderator offer cannot be taken for ownership, nor the reverse.
      expect(
        codeOf(
          state.act({
            action: 'moderator.accept',
            actor: mod,
            subject: mod,
            offer: event.seq,
          }),
        ),
      ).toBe('InvalidOffer')
      expect(
        codeOf(
          state.act({
            action: 'owner.accept',
            actor: member,
            subject: member,
            offer: event.seq,
          }),
        ),
      ).toBe('InvalidOffer')
      expect(
        codeOf(
          state.act({
            action: 'owner.accept',
            actor: mod,
            subject: mod,
            offer: event.seq,
          }),
        ),
      ).toBe('ok')
      // Ownership replaces the moderator's office.
      expect(state.member(mod)?.offices).toEqual(['owner'])
      expect(
        codeOf(
          state.act({ action: 'owner.resign', actor: owner, subject: owner }),
        ),
      ).toBe('ok')
      expect(state.member(owner)).toMatchObject({
        status: 'active',
        offices: [],
      })
      expect(
        codeOf(state.act({ action: 'owner.resign', actor: mod, subject: mod })),
      ).toBe('LastOwner')
    })

    it('refuses an owner offer once the offering owner has resigned', () => {
      const state = founded()
      const first = state.act({
        action: 'owner.offer',
        actor: owner,
        subject: mod,
      })
      const second = state.act({
        action: 'owner.offer',
        actor: owner,
        subject: member,
      })
      state.act({
        action: 'owner.accept',
        actor: mod,
        subject: mod,
        offer: first.event.seq,
      })
      state.act({ action: 'owner.resign', actor: owner, subject: owner })
      expect(
        codeOf(
          state.act({
            action: 'owner.accept',
            actor: member,
            subject: member,
            offer: second.event.seq,
          }),
        ),
      ).toBe('InvalidOffer')
    })

    it('lets stewards moderate a share held by its sharer’s repo', () => {
      const state = founded()
      const target = share(member)
      expect(
        codeOf(
          state.act({
            action: 'content.hide',
            actor: member,
            subject: member,
            target,
          }),
        ),
      ).toBe('NotPermitted')
      // The subject must be the repo that holds the target.
      expect(
        codeOf(
          state.act({
            action: 'content.hide',
            actor: mod,
            subject: owner,
            target,
          }),
        ),
      ).toBe('InvalidTarget')
      expect(
        codeOf(
          state.act({
            action: 'content.hide',
            actor: mod,
            subject: member,
            target: draft(member),
          }),
        ),
      ).toBe('InvalidTarget')
      for (const action of [
        'content.hide',
        'content.pin',
        'content.unpin',
        'content.restore',
      ] as const) {
        expect(
          codeOf(state.act({ action, actor: mod, subject: member, target })),
        ).toBe('ok')
      }
      expect(state.effects).toEqual([
        { kind: 'content', target, hidden: true },
        { kind: 'content', target, pinned: true },
        { kind: 'content', target, pinned: false },
        { kind: 'content', target, hidden: false },
      ])
    })

    it('records each community’s own half of a relation, for owners only', () => {
      const state = founded()
      const other = 'did:plc:other'
      expect(
        codeOf(
          state.act({ action: 'relation.link', actor: mod, subject: other }),
        ),
      ).toBe('NotPermitted')
      expect(
        codeOf(
          state.act({
            action: 'relation.link',
            actor: owner,
            subject: state.community,
          }),
        ),
      ).toBe('InvalidSubject')
      for (const action of [
        'relation.link',
        'relation.accept',
        'relation.unlink',
      ] as const) {
        expect(
          codeOf(state.act({ action, actor: owner, subject: other })),
        ).toBe('ok')
      }
      expect(state.effects).toEqual([
        { kind: 'relation', other, half: 'link' },
        { kind: 'relation', other, half: 'accept' },
        { kind: 'relation', other, half: null },
      ])
    })

    it('publishes the version of a member’s draft that a steward names', () => {
      const state = founded()
      const target = draft(member)
      const cid = 'bafyreib2rxk3rybk3aobmv5cjuql3bm2twh4jo5uxgf5kpqcsgz7soitae'
      const publish = {
        action: 'briefing.publish',
        actor: mod,
        subject: member,
        target,
      } as const
      expect(codeOf(state.act({ ...publish, actor: member }))).toBe(
        'NotPermitted',
      )
      expect(codeOf(state.act(publish))).toBe('InvalidTarget') // no CID
      expect(codeOf(state.act({ ...publish, targetCid: cid }))).toBe('ok')
      expect(
        codeOf(
          state.act({
            ...publish,
            subject: outsider,
            target: draft(outsider),
            targetCid: cid,
          }),
        ),
      ).toBe('InvalidSubject') // not a member
      expect(
        codeOf(
          state.act({ ...publish, action: 'briefing.archive', targetCid: cid }),
        ),
      ).toBe('ok')
      expect(state.effects).toEqual([
        { kind: 'briefing', target, cid, state: 'published' },
        { kind: 'briefing', target, cid, state: 'archived' },
      ])
    })

    it('binds a request to every parameter of the action', () => {
      const event = prepareCommunityEvent({
        seq: 9,
        action: 'briefing.publish',
        actor: mod,
        subject: member,
        createdAt: new Date(t0).toISOString(),
        target: draft(member),
        targetCid:
          'bafyreib2rxk3rybk3aobmv5cjuql3bm2twh4jo5uxgf5kpqcsgz7soitae',
      })
      const request = {
        community: 'did:plc:community',
        action: 'briefing.publish',
        subject: member,
        target: event.target,
        targetCid: event.targetCid,
        createdAt: new Date(t0 - 1000).toISOString(),
        expiresAt: new Date(t0 + 1000).toISOString(),
      }
      expect(
        communityRequestMismatch('did:plc:community', request, event),
      ).toBeNull()
      for (const changed of [
        { target: draft(owner) },
        {
          targetCid:
            'bafyreigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
        },
        { target: undefined },
        { sanction: 'block' },
      ]) {
        expect(
          communityRequestMismatch(
            'did:plc:community',
            { ...request, ...changed },
            event,
          ),
        ).toMatch(/different/)
      }
    })
  })
})
