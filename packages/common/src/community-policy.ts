/**
 * The one policy for community accounts (OD-9). The PDS's
 * `com.para.community.act` calls {@link applyCommunityEvent} to authorize and
 * to compute the event it appends; the AppView calls it to verify each event
 * of a community repo, in `seq` order. Both read state through
 * {@link CommunityStateView} and store the returned patch, so the two cannot
 * disagree about what an event means.
 *
 * Everything here is pure: time comes from the event's own `createdAt`,
 * which the hosting PDS sets from its clock.
 */

export const COMMUNITY_OFFER_DAYS = 14
export const COMMUNITY_MAX_SUSPENSION_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export type CommunityGovernanceMode = 'hierarchical' | 'horizontal'
export type CommunityAdmissionMode = 'open' | 'assembly_approval'
export type CommunityOffice = 'owner' | 'moderator'
export type CommunityMemberStatus =
  | 'active'
  | 'suspended'
  | 'left'
  /** Removed by an owner. May join again while admission is open. */
  | 'removed'
  /** Blocked by an owner. Cannot join until unblocked. */
  | 'blocked'
export type CommunitySanction = 'remove' | 'block'
/** What an open offer or proposal grants: an office, or a sanction to decide. */
export type CommunityOfferKind = CommunityOffice | CommunitySanction

export const COMMUNITY_ACTIONS = [
  'community.found',
  'member.join',
  'member.leave',
  'moderator.offer',
  'moderator.accept',
  'moderator.revoke',
  'moderator.resign',
  'member.suspend',
  'member.reinstate',
  'member.remove',
  'member.block',
  'member.unblock',
  'sanction.propose',
  'owner.offer',
  'owner.accept',
  'owner.resign',
  'content.hide',
  'content.restore',
  'content.pin',
  'content.unpin',
  'relation.link',
  'relation.accept',
  'relation.unlink',
  'briefing.publish',
  'briefing.archive',
  'profile.update',
] as const

export type CommunityAction = (typeof COMMUNITY_ACTIONS)[number]

export function isCommunityAction(value: unknown): value is CommunityAction {
  return (COMMUNITY_ACTIONS as readonly unknown[]).includes(value)
}

export interface CommunitySettings {
  governanceMode: CommunityGovernanceMode
  admissionMode: CommunityAdmissionMode
}

export interface CommunityMember {
  status: CommunityMemberStatus
  offices: CommunityOffice[]
  /** Set while `status` is `suspended`. */
  suspendedUntil?: string
  /** The `seq` of the event that last changed this member. */
  since: number
}

export interface CommunityOffer {
  seq: number
  /** An office for an offer; the sanction proposed for a `sanction.propose`. */
  office: CommunityOfferKind
  subject: string
  issuer: string
  expiresAt: string
}

/** What {@link applyCommunityEvent} reads; each caller backs it with its own store. */
export interface CommunityStateView {
  /** The community's own DID. */
  community: string
  /** `null` until `community.found` has been applied. */
  settings: CommunitySettings | null
  lastSeq: number
  member(did: string): CommunityMember | undefined
  /** An offer that is still open: not yet accepted. Expiry is checked here. */
  openOffer(seq: number): CommunityOffer | undefined
  /** Active owners. Owners cannot be suspended, so this is all owners. */
  ownerCount(): number
}

/**
 * The presentation fields of a community's profile record. A type alias, not
 * an interface, so it fits a record's `LexMap` fields.
 */
export type CommunityProfile = {
  name: string
  description?: string
  quadrant: string
  region?: string
}

export interface CommunityEvent {
  seq: number
  action: CommunityAction
  actor: string
  subject: string
  createdAt: string
  /**
   * The `seq` of the offer or proposal this event answers: required on
   * `moderator.accept` and `owner.accept`, optional on `member.remove` and
   * `member.block` (an owner acting on a moderator's `sanction.propose`).
   */
  offer?: number
  /**
   * `*.offer` and `sanction.propose`: when it lapses. `member.suspend`: end
   * of the suspension.
   */
  expiresAt?: string
  /** `sanction.propose`: what the moderator asks the owner to do. */
  sanction?: CommunitySanction
  /**
   * `content.*`: the share acted on. `briefing.*`: the draft. For both the
   * subject is the DID that holds the record, and `at-uri`'s host.
   */
  target?: string
  /** `briefing.*`: the CID of the draft version published or archived. */
  targetCid?: string
  /** `profile.update`: the presentation the profile record is set to. */
  profile?: CommunityProfile
  /** `community.found` only. */
  settings?: CommunitySettings
}

/**
 * What an event does outside the host's membership state. The host keeps no
 * state for these (it has nothing to check them against), so it ignores
 * them; the AppView stores them and serves its views from them.
 */
export type CommunityEffect =
  | {
      kind: 'content'
      target: string
      /** Unchanged when absent. */
      hidden?: boolean
      pinned?: boolean
    }
  | {
      kind: 'briefing'
      target: string
      cid: string
      state: 'published' | 'archived'
    }
  | {
      /**
       * This community's half of a relation with `other`: the parent's
       * `link`, the child's `accept`, or `null` once withdrawn. A relation
       * counts only when both communities hold their halves.
       */
      kind: 'relation'
      other: string
      half: 'link' | 'accept' | null
    }

export interface CommunityPatch {
  members: Array<[string, CommunityMember]>
  openedOffers: CommunityOffer[]
  closedOffers: number[]
  effects: CommunityEffect[]
  settings?: CommunitySettings
}

export type CommunityRefusalCode =
  | 'OutOfSequence'
  | 'NotFounded'
  | 'AlreadyFounded'
  | 'ModeUnavailable'
  | 'NotPermitted'
  | 'InvalidSubject'
  | 'InvalidOffer'
  | 'InvalidExpiry'
  | 'InvalidTarget'
  | 'InvalidProfile'
  | 'LastOwner'

export type CommunityDecision =
  | { ok: true; patch: CommunityPatch }
  | { ok: false; code: CommunityRefusalCode; message: string }

/**
 * The member as of `at`: a suspension whose end has passed reads as active.
 * Stored state only changes with events, so readers must apply this.
 */
export function effectiveCommunityMember(
  member: CommunityMember | undefined,
  at: number,
): CommunityMember | undefined {
  if (
    member?.status === 'suspended' &&
    member.suspendedUntil &&
    Date.parse(member.suspendedUntil) <= at
  ) {
    const { suspendedUntil: _ended, ...rest } = member
    return { ...rest, status: 'active' }
  }
  return member
}

/** Offices that grant power as of `at`: none unless the member is active. */
export function activeCommunityOffices(
  member: CommunityMember | undefined,
  at: number,
): CommunityOffice[] {
  const effective = effectiveCommunityMember(member, at)
  return effective?.status === 'active' ? effective.offices : []
}

/**
 * The event a well-behaved host appends for a request, with the time-bound
 * fields computed from `createdAt`. {@link applyCommunityEvent} accepts
 * exactly these values, so a client never chooses an expiry.
 */
export function prepareCommunityEvent(input: {
  seq: number
  action: CommunityAction
  actor: string
  subject: string
  createdAt: string
  offer?: number
  suspensionDays?: number
  sanction?: CommunitySanction
  target?: string
  targetCid?: string
  profile?: CommunityProfile
  settings?: CommunitySettings
}): CommunityEvent {
  const at = Date.parse(input.createdAt)
  const event: CommunityEvent = {
    seq: input.seq,
    action: input.action,
    actor: input.actor,
    subject: input.subject,
    createdAt: input.createdAt,
  }
  if (OFFERING_ACTIONS.includes(input.action)) {
    event.expiresAt = new Date(at + COMMUNITY_OFFER_DAYS * DAY_MS).toISOString()
  }
  if (input.action === 'member.suspend') {
    const days = input.suspensionDays ?? COMMUNITY_MAX_SUSPENSION_DAYS
    event.expiresAt = new Date(at + days * DAY_MS).toISOString()
  }
  if (input.offer !== undefined) event.offer = input.offer
  if (input.sanction !== undefined) event.sanction = input.sanction
  if (input.target !== undefined) event.target = input.target
  if (input.targetCid !== undefined) event.targetCid = input.targetCid
  if (input.profile !== undefined) event.profile = input.profile
  if (input.action === 'community.found') event.settings = input.settings
  return event
}

/** Actions that open something to be answered within the offer period. */
const OFFERING_ACTIONS: readonly CommunityAction[] = [
  'moderator.offer',
  'owner.offer',
  'sanction.propose',
]

/** Collections of the records that `content.*` and `briefing.*` name. */
export const COMMUNITY_SHARE_COLLECTION = 'com.para.community.sharedContent'
export const COMMUNITY_BRIEFING_COLLECTION = 'com.para.community.briefingPack'

/** The repo that holds `uri`, if it is an AT URI to a record in `collection`. */
function recordHost(
  uri: string | undefined,
  collection: string,
): string | null {
  const match = uri?.match(/^at:\/\/([^/]+)\/([^/]+)\/([^/]+)$/)
  return match && match[2] === collection ? match[1] : null
}

/**
 * Decides whether `event` may follow the state in `view`, and if so returns
 * what it changes. A refusal changes nothing.
 */
export function applyCommunityEvent(
  view: CommunityStateView,
  event: CommunityEvent,
): CommunityDecision {
  if (event.seq !== view.lastSeq + 1) {
    return refuse('OutOfSequence', `Expected seq ${view.lastSeq + 1}.`)
  }
  const at = Date.parse(event.createdAt)
  if (!Number.isFinite(at)) {
    return refuse('InvalidExpiry', 'The event has no valid time.')
  }

  if (event.action === 'community.found') {
    if (view.settings || event.seq !== 1) {
      return refuse('AlreadyFounded', 'The community is already founded.')
    }
    if (event.actor !== event.subject) {
      return refuse('NotPermitted', 'The founder founds for themselves.')
    }
    const settings = event.settings
    if (
      settings?.governanceMode !== 'hierarchical' ||
      settings.admissionMode !== 'open'
    ) {
      // @NOTE horizontal communities and assembly admission need assembly
      // decisions, which stay closed until a trusted tally verifier exists.
      return refuse(
        'ModeUnavailable',
        'Only hierarchical communities with open admission can be founded.',
      )
    }
    return accept({
      members: [
        [event.subject, { status: 'active', offices: ['owner'], since: 1 }],
      ],
      settings,
    })
  }

  if (!view.settings) {
    return refuse('NotFounded', 'The community has not been founded.')
  }
  const actor = effectiveCommunityMember(view.member(event.actor), at)
  const subject = effectiveCommunityMember(view.member(event.subject), at)
  const actorOffices = activeCommunityOffices(actor, at)
  const isOwner = actorOffices.includes('owner')
  const isSteward = isOwner || actorOffices.includes('moderator')
  const self = event.actor === event.subject
  const update = (member: CommunityMember): CommunityDecision =>
    accept({ members: [[event.subject, { ...member, since: event.seq }]] })

  const holds = (member: CommunityMember | undefined, office: string) =>
    member?.offices.includes(office as CommunityOffice) ?? false
  const offerExpiry = (): CommunityDecision | null => {
    const expected = at + COMMUNITY_OFFER_DAYS * DAY_MS
    return !event.expiresAt || Date.parse(event.expiresAt) !== expected
      ? refuse('InvalidExpiry', 'Offers expire after the fixed period.')
      : null
  }

  switch (event.action) {
    case 'member.join': {
      if (!self) return refuse('NotPermitted', 'Members join for themselves.')
      if (view.settings.admissionMode !== 'open') {
        return refuse('ModeUnavailable', 'Admission is not open.')
      }
      if (subject?.status === 'blocked') {
        return refuse('NotPermitted', 'An owner has blocked this account.')
      }
      if (
        subject &&
        subject.status !== 'left' &&
        subject.status !== 'removed'
      ) {
        return refuse('InvalidSubject', 'Already a member, or suspended.')
      }
      // Rejoining never restores offices: leaving or removal ended them.
      return update({ status: 'active', offices: [], since: event.seq })
    }
    case 'member.leave': {
      if (!self) return refuse('NotPermitted', 'Members leave for themselves.')
      if (subject?.status !== 'active') {
        return refuse('InvalidSubject', 'Only an active member can leave.')
      }
      if (holds(subject, 'owner') && view.ownerCount() <= 1) {
        return refuse('LastOwner', 'The last owner cannot leave.')
      }
      return update({ status: 'left', offices: [], since: event.seq })
    }
    case 'moderator.offer':
    case 'owner.offer': {
      const office = event.action === 'owner.offer' ? 'owner' : 'moderator'
      if (!isOwner) return refuse('NotPermitted', 'Only an owner can offer.')
      if (
        subject?.status !== 'active' ||
        (office === 'owner'
          ? holds(subject, 'owner')
          : subject.offices.length > 0)
      ) {
        return refuse(
          'InvalidSubject',
          office === 'owner'
            ? 'Ownership is offered to active members who are not owners.'
            : 'Offers go to active members who hold no office.',
        )
      }
      const wrong = offerExpiry()
      if (wrong) return wrong
      return accept({
        members: [],
        openedOffers: [
          {
            seq: event.seq,
            office,
            subject: event.subject,
            issuer: event.actor,
            expiresAt: event.expiresAt!,
          },
        ],
      })
    }
    case 'moderator.accept':
    case 'owner.accept': {
      const office = event.action === 'owner.accept' ? 'owner' : 'moderator'
      if (!self)
        return refuse('NotPermitted', 'Only the offered member accepts.')
      const offer =
        event.offer === undefined ? undefined : view.openOffer(event.offer)
      if (
        !offer ||
        offer.office !== office ||
        offer.subject !== event.subject ||
        Date.parse(offer.expiresAt) <= at
      ) {
        return refuse('InvalidOffer', 'There is no open offer to accept.')
      }
      // The offer stands only while whoever made it is still an owner.
      const issuer = view.member(offer.issuer)
      if (!activeCommunityOffices(issuer, at).includes('owner')) {
        return refuse('InvalidOffer', 'The offer was made by a former owner.')
      }
      if (
        subject?.status !== 'active' ||
        (office === 'owner'
          ? holds(subject, 'owner')
          : subject.offices.length > 0)
      ) {
        return refuse('InvalidSubject', 'Only an active member can accept.')
      }
      return accept({
        members: [
          [
            event.subject,
            // Ownership replaces a moderator's office; it does not stack.
            { ...subject, offices: [office], since: event.seq },
          ],
        ],
        closedOffers: [offer.seq],
      })
    }
    case 'moderator.revoke':
    case 'moderator.resign': {
      const revoke = event.action === 'moderator.revoke'
      if (revoke ? !isOwner : !self) {
        return refuse(
          'NotPermitted',
          revoke
            ? 'Only an owner can revoke.'
            : 'Moderators resign for themselves.',
        )
      }
      const current = view.member(event.subject)
      if (!current?.offices.includes('moderator')) {
        return refuse('InvalidSubject', 'The subject is not a moderator.')
      }
      return update({
        ...current,
        offices: current.offices.filter((office) => office !== 'moderator'),
      })
    }
    case 'owner.resign': {
      if (!self) return refuse('NotPermitted', 'Owners resign for themselves.')
      if (subject?.status !== 'active' || !holds(subject, 'owner')) {
        return refuse('InvalidSubject', 'The subject is not an owner.')
      }
      if (view.ownerCount() <= 1) {
        return refuse('LastOwner', 'The last owner cannot resign.')
      }
      // They stay a member; ownership is theirs to hold, not to keep.
      return update({
        ...subject,
        offices: subject.offices.filter((office) => office !== 'owner'),
      })
    }
    case 'member.suspend': {
      if (!isSteward) {
        return refuse('NotPermitted', 'Only a moderator or owner can suspend.')
      }
      if (self || subject?.status !== 'active') {
        return refuse('InvalidSubject', 'Only another active member.')
      }
      if (subject.offices.includes('owner')) {
        return refuse('InvalidSubject', 'Owners cannot be suspended.')
      }
      if (subject.offices.includes('moderator') && !isOwner) {
        return refuse('NotPermitted', 'Only an owner can suspend a moderator.')
      }
      const until = event.expiresAt ? Date.parse(event.expiresAt) : NaN
      if (
        !(until > at) ||
        until - at > COMMUNITY_MAX_SUSPENSION_DAYS * DAY_MS
      ) {
        return refuse('InvalidExpiry', 'Suspensions last at most 7 days.')
      }
      return update({
        ...subject,
        status: 'suspended',
        suspendedUntil: event.expiresAt,
      })
    }
    case 'member.reinstate': {
      if (!isSteward) {
        return refuse(
          'NotPermitted',
          'Only a moderator or owner can reinstate.',
        )
      }
      if (subject?.status !== 'suspended') {
        return refuse('InvalidSubject', 'The subject is not suspended.')
      }
      const { suspendedUntil: _ended, ...rest } = subject
      return update({ ...rest, status: 'active' })
    }
    case 'sanction.propose': {
      // Owners decide directly; a proposal is how a moderator asks them to.
      if (!actorOffices.includes('moderator')) {
        return refuse('NotPermitted', 'Only a moderator proposes sanctions.')
      }
      if (event.sanction !== 'remove' && event.sanction !== 'block') {
        return refuse('InvalidTarget', 'Propose removing or blocking.')
      }
      if (
        self ||
        (subject?.status !== 'active' && subject?.status !== 'suspended') ||
        holds(subject, 'owner')
      ) {
        return refuse(
          'InvalidSubject',
          'Only another member who is not an owner.',
        )
      }
      const wrong = offerExpiry()
      if (wrong) return wrong
      return accept({
        members: [],
        openedOffers: [
          {
            seq: event.seq,
            office: event.sanction,
            subject: event.subject,
            issuer: event.actor,
            expiresAt: event.expiresAt!,
          },
        ],
      })
    }
    case 'member.remove':
    case 'member.block': {
      const sanction = event.action === 'member.block' ? 'block' : 'remove'
      if (!isOwner) {
        return refuse('NotPermitted', 'Only an owner can remove or block.')
      }
      const current = view.member(event.subject)
      if (self || holds(current, 'owner')) {
        return refuse(
          'InvalidSubject',
          'An owner cannot be sanctioned; they resign first.',
        )
      }
      if (
        sanction === 'remove'
          ? subject?.status !== 'active' && subject?.status !== 'suspended'
          : subject?.status === 'blocked'
      ) {
        return refuse(
          'InvalidSubject',
          sanction === 'remove'
            ? 'Only a current member can be removed.'
            : 'The subject is already blocked.',
        )
      }
      const closedOffers: number[] = []
      if (event.offer !== undefined) {
        const proposal = view.openOffer(event.offer)
        if (
          !proposal ||
          proposal.office !== sanction ||
          proposal.subject !== event.subject ||
          Date.parse(proposal.expiresAt) <= at
        ) {
          return refuse('InvalidOffer', 'There is no open proposal to act on.')
        }
        closedOffers.push(proposal.seq)
      }
      return accept({
        members: [
          [
            event.subject,
            {
              status: sanction === 'block' ? 'blocked' : 'removed',
              offices: [],
              since: event.seq,
            },
          ],
        ],
        closedOffers,
      })
    }
    case 'member.unblock': {
      if (!isOwner) return refuse('NotPermitted', 'Only an owner can unblock.')
      if (subject?.status !== 'blocked') {
        return refuse('InvalidSubject', 'The subject is not blocked.')
      }
      // Unblocking restores the right to join, not membership.
      return update({ status: 'left', offices: [], since: event.seq })
    }
    case 'content.hide':
    case 'content.restore':
    case 'content.pin':
    case 'content.unpin': {
      if (!isSteward) {
        return refuse('NotPermitted', 'Only a moderator or owner can do this.')
      }
      if (
        recordHost(event.target, COMMUNITY_SHARE_COLLECTION) !== event.subject
      ) {
        return refuse(
          'InvalidTarget',
          'The target must be a shared item held by the subject.',
        )
      }
      const flag = {
        'content.hide': { hidden: true },
        'content.restore': { hidden: false },
        'content.pin': { pinned: true },
        'content.unpin': { pinned: false },
      }[event.action]
      return accept({
        members: [],
        effects: [{ kind: 'content', target: event.target!, ...flag }],
      })
    }
    case 'relation.link':
    case 'relation.accept':
    case 'relation.unlink': {
      if (!isOwner) {
        return refuse('NotPermitted', 'Only an owner can change relations.')
      }
      if (event.subject === view.community) {
        return refuse('InvalidSubject', 'A community cannot relate to itself.')
      }
      return accept({
        members: [],
        effects: [
          {
            kind: 'relation',
            other: event.subject,
            half:
              event.action === 'relation.link'
                ? 'link'
                : event.action === 'relation.accept'
                  ? 'accept'
                  : null,
          },
        ],
      })
    }
    case 'profile.update': {
      if (!isOwner) {
        return refuse('NotPermitted', 'Only an owner can change the profile.')
      }
      if (event.subject !== event.actor) {
        return refuse('InvalidSubject', 'The profile has no other subject.')
      }
      const profile = event.profile
      if (!profile || !profile.name.trim() || !profile.quadrant.trim()) {
        return refuse(
          'InvalidProfile',
          'A profile needs a name and a quadrant.',
        )
      }
      // The host writes the record; nothing outside it changes.
      return accept({ members: [] })
    }
    case 'briefing.publish':
    case 'briefing.archive': {
      if (!isSteward) {
        return refuse('NotPermitted', 'Only a moderator or owner can do this.')
      }
      if (
        recordHost(event.target, COMMUNITY_BRIEFING_COLLECTION) !==
          event.subject ||
        !event.targetCid
      ) {
        return refuse(
          'InvalidTarget',
          'The target must be a draft held by the subject, with its CID.',
        )
      }
      const publish = event.action === 'briefing.publish'
      // Members draft; only a current member's draft can be published.
      if (publish && subject?.status !== 'active') {
        return refuse('InvalidSubject', 'Only an active member’s draft.')
      }
      return accept({
        members: [],
        effects: [
          {
            kind: 'briefing',
            target: event.target!,
            cid: event.targetCid,
            state: publish ? 'published' : 'archived',
          },
        ],
      })
    }
  }
}

/** OD-9 §6: an event must follow its member request within this window. */
export const COMMUNITY_REQUEST_MAX_TTL_MS = DAY_MS

/** A person's `com.para.community.request`, as read from their repo. */
export interface CommunityRequest {
  community: string
  action: string
  subject: string
  offer?: number
  suspensionDays?: number
  sanction?: string
  target?: string
  targetCid?: string
  profile?: CommunityProfile
  createdAt: string
  expiresAt: string
}

/**
 * Why `request` does not authorize `event` in `community`, or `null` if it
 * does. Pure, so the host (before appending) and the AppView (verifying)
 * reach the same answer. Checks that the request names exactly this action,
 * and that the event was created inside the request's validity window.
 */
export function communityRequestMismatch(
  community: string,
  request: CommunityRequest,
  event: CommunityEvent,
): string | null {
  if (
    request.community !== community ||
    request.action !== event.action ||
    request.subject !== event.subject
  ) {
    return 'The request names a different action.'
  }
  if ((request.offer ?? undefined) !== (event.offer ?? undefined)) {
    return 'The request names a different offer.'
  }
  for (const key of ['sanction', 'target', 'targetCid'] as const) {
    if ((request[key] ?? undefined) !== (event[key] ?? undefined)) {
      return 'The request names different parameters.'
    }
  }
  if (!sameProfile(request.profile, event.profile)) {
    return 'The request names a different profile.'
  }
  if (event.action === 'member.suspend') {
    const days = request.suspensionDays ?? COMMUNITY_MAX_SUSPENSION_DAYS
    const length =
      Date.parse(event.expiresAt ?? '') - Date.parse(event.createdAt)
    if (length !== days * DAY_MS) {
      return 'The suspension differs from the request.'
    }
  } else if (request.suspensionDays !== undefined) {
    return 'The request names a different action.'
  }
  const created = Date.parse(request.createdAt)
  const expires = Date.parse(request.expiresAt)
  const at = Date.parse(event.createdAt)
  if (
    !(created <= at) ||
    !(at < expires) ||
    expires - created > COMMUNITY_REQUEST_MAX_TTL_MS
  ) {
    return 'The event falls outside the request’s validity.'
  }
  return null
}

/** Whether two profile updates set every field alike; absent equals absent. */
function sameProfile(a?: CommunityProfile, b?: CommunityProfile): boolean {
  if (!a || !b) return !a && !b
  return (
    a.name === b.name &&
    (a.description ?? undefined) === (b.description ?? undefined) &&
    a.quadrant === b.quadrant &&
    (a.region ?? undefined) === (b.region ?? undefined)
  )
}

export interface CommunityActionDescription {
  action: CommunityAction
  /** Who may take the action. */
  actor: 'self' | 'owner' | 'moderator' | 'steward' | 'offered member'
  available: boolean
}

/**
 * What can be done in a community with `settings`, from the same rules as
 * {@link applyCommunityEvent}. Clients describe roles from this, so they can
 * only advertise what the policy allows.
 */
export function describeCommunityActions(
  settings: CommunitySettings,
): CommunityActionDescription[] {
  const open = settings.admissionMode === 'open'
  const actors: Record<
    Exclude<CommunityAction, 'community.found'>,
    CommunityActionDescription['actor']
  > = {
    'member.join': 'self',
    'member.leave': 'self',
    'moderator.offer': 'owner',
    'moderator.accept': 'offered member',
    'moderator.revoke': 'owner',
    'moderator.resign': 'self',
    'member.suspend': 'steward',
    'member.reinstate': 'steward',
    'member.remove': 'owner',
    'member.block': 'owner',
    'member.unblock': 'owner',
    'sanction.propose': 'moderator',
    'owner.offer': 'owner',
    'owner.accept': 'offered member',
    'owner.resign': 'self',
    'content.hide': 'steward',
    'content.restore': 'steward',
    'content.pin': 'steward',
    'content.unpin': 'steward',
    'relation.link': 'owner',
    'relation.accept': 'owner',
    'relation.unlink': 'owner',
    'briefing.publish': 'steward',
    'briefing.archive': 'steward',
    'profile.update': 'owner',
  }
  return Object.entries(actors).map(([action, actor]) => ({
    action: action as CommunityAction,
    actor,
    available: action === 'member.join' ? open : true,
  }))
}

function accept(
  patch: Partial<CommunityPatch> & Pick<CommunityPatch, 'members'>,
): CommunityDecision {
  return {
    ok: true,
    patch: { openedOffers: [], closedOffers: [], effects: [], ...patch },
  }
}

function refuse(
  code: CommunityRefusalCode,
  message: string,
): CommunityDecision {
  return { ok: false, code, message }
}
