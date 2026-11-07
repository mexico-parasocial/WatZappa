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
export type CommunityMemberStatus = 'active' | 'suspended' | 'left'

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
  office: CommunityOffice
  subject: string
  issuer: string
  expiresAt: string
}

/** What {@link applyCommunityEvent} reads; each caller backs it with its own store. */
export interface CommunityStateView {
  /** `null` until `community.found` has been applied. */
  settings: CommunitySettings | null
  lastSeq: number
  member(did: string): CommunityMember | undefined
  /** An offer that is still open: not yet accepted. Expiry is checked here. */
  openOffer(seq: number): CommunityOffer | undefined
  /** Active owners. Owners cannot be suspended, so this is all owners. */
  ownerCount(): number
}

export interface CommunityEvent {
  seq: number
  action: CommunityAction
  actor: string
  subject: string
  createdAt: string
  /** `moderator.accept`: the `seq` of the offer. */
  offer?: number
  /** `moderator.offer`: offer expiry. `member.suspend`: end of the suspension. */
  expiresAt?: string
  /** `community.found` only. */
  settings?: CommunitySettings
}

export interface CommunityPatch {
  members: Array<[string, CommunityMember]>
  openedOffers: CommunityOffer[]
  closedOffers: number[]
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
  if (input.action === 'moderator.offer') {
    event.expiresAt = new Date(at + COMMUNITY_OFFER_DAYS * DAY_MS).toISOString()
  }
  if (input.action === 'member.suspend') {
    const days = input.suspensionDays ?? COMMUNITY_MAX_SUSPENSION_DAYS
    event.expiresAt = new Date(at + days * DAY_MS).toISOString()
  }
  if (input.action === 'moderator.accept') event.offer = input.offer
  if (input.action === 'community.found') event.settings = input.settings
  return event
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

  switch (event.action) {
    case 'member.join': {
      if (!self) return refuse('NotPermitted', 'Members join for themselves.')
      if (view.settings.admissionMode !== 'open') {
        return refuse('ModeUnavailable', 'Admission is not open.')
      }
      if (subject && subject.status !== 'left') {
        return refuse('InvalidSubject', 'Already a member, or suspended.')
      }
      // Rejoining never restores offices: leaving ended them.
      return update({ status: 'active', offices: [], since: event.seq })
    }
    case 'member.leave': {
      if (!self) return refuse('NotPermitted', 'Members leave for themselves.')
      if (subject?.status !== 'active') {
        return refuse('InvalidSubject', 'Only an active member can leave.')
      }
      if (subject.offices.includes('owner') && view.ownerCount() <= 1) {
        return refuse('LastOwner', 'The last owner cannot leave.')
      }
      return update({ status: 'left', offices: [], since: event.seq })
    }
    case 'moderator.offer': {
      if (!isOwner) return refuse('NotPermitted', 'Only an owner can offer.')
      if (subject?.status !== 'active' || subject.offices.length > 0) {
        return refuse(
          'InvalidSubject',
          'Offers go to active members who hold no office.',
        )
      }
      const expected = at + COMMUNITY_OFFER_DAYS * DAY_MS
      if (!event.expiresAt || Date.parse(event.expiresAt) !== expected) {
        return refuse('InvalidExpiry', 'Offers expire after the fixed period.')
      }
      return accept({
        members: [],
        openedOffers: [
          {
            seq: event.seq,
            office: 'moderator',
            subject: event.subject,
            issuer: event.actor,
            expiresAt: event.expiresAt,
          },
        ],
      })
    }
    case 'moderator.accept': {
      if (!self)
        return refuse('NotPermitted', 'Only the offered member accepts.')
      const offer =
        event.offer === undefined ? undefined : view.openOffer(event.offer)
      if (
        !offer ||
        offer.office !== 'moderator' ||
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
      if (subject?.status !== 'active' || subject.offices.length > 0) {
        return refuse('InvalidSubject', 'Only an active member can accept.')
      }
      return accept({
        members: [
          [
            event.subject,
            { ...subject, offices: ['moderator'], since: event.seq },
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

export interface CommunityActionDescription {
  action: CommunityAction
  /** Who may take the action. */
  actor: 'self' | 'owner' | 'steward' | 'offered member'
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
    patch: { openedOffers: [], closedOffers: [], ...patch },
  }
}

function refuse(
  code: CommunityRefusalCode,
  message: string,
): CommunityDecision {
  return { ok: false, code, message }
}
