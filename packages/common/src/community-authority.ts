export const AUTHORITY_EVENT_VERSION = 1
export const HORIZONTAL_MODERATOR_TERM_DAYS = 90
export const TEMPORARY_SUSPENSION_DAYS = 7

export type CommunityRole = 'member' | 'moderator' | 'owner'
export type OrganizationStandard = 'hierarchical' | 'horizontal'
export type AdmissionMode = 'open' | 'assembly_approval'
export type AuthorizationStatus = 'allowed' | 'requires_approval' | 'denied'

export type AuthorityAction =
  | 'member.activate'
  | 'member.suspend'
  | 'member.reinstate'
  | 'member.remove'
  | 'member.block'
  | 'moderator.grant'
  | 'moderator.revoke'
  | 'moderator.resign'
  | 'owner.grant'
  | 'owner.revoke'

export type AuthorityBasis =
  | 'openAdmission'
  | 'assemblyDecision'
  | 'ownerAppointment'
  | 'ownerTransfer'
  | 'foundingTransition'
  | 'resignation'
  | 'expiry'
  | 'migration'

export interface CommunityAuthorityEvent {
  uri: string
  creator: string
  community: string
  subject: string
  action: AuthorityAction
  issuer: string
  effectiveAt: string
  expiresAt?: string | null
  predecessor?: string | null
  version: number
  basis: AuthorityBasis
  evidence?: string | null
}

export interface EffectiveAuthority {
  membershipState: 'none' | 'active' | 'suspended' | 'removed' | 'blocked'
  roles: CommunityRole[]
  evidence: Partial<Record<CommunityRole, CommunityAuthorityEvent>>
}

export interface AvailableAction {
  action: string
  status: AuthorizationStatus
  policy: string
  reason?: string
  evidence?: string
}

export interface RoleDefinition {
  role: 'visitor' | 'member' | 'moderator' | 'owner' | 'assembly'
  howToObtain: string
  responsibilities: string[]
  actions: string[]
  permissions: string[]
}

export const MEMBER_CAPABILITIES = [
  'content.create',
  'content.share',
  'proposal.create',
  'deliberation.participate',
  'vote.cast',
  'delegation.manageOwn',
  'appeal.create',
  'membership.leave',
] as const

export const MODERATOR_CAPABILITIES = [
  'content.moderate',
  'content.pin',
  'briefing.manage',
  'report.resolve',
  'member.suspendTemporary',
  'assembly.facilitate',
  'decision.execute',
] as const

export const OWNER_CAPABILITIES = [
  'community.settings.manage',
  'role.moderator.manage',
  'governance.change.propose',
  'owner.transfer',
  'governance.execute',
] as const

export function getRoleDefinitions(
  standard: OrganizationStandard,
  admissionMode: AdmissionMode,
): RoleDefinition[] {
  const admission =
    admissionMode === 'open'
      ? 'Join the community directly.'
      : 'Request membership and receive approval from an ordinary assembly decision.'
  const moderator =
    standard === 'horizontal'
      ? 'Win an assembly election, accept the role, and serve a 90-day term.'
      : 'Receive an appointment from the owner and accept the role.'
  const definitions: RoleDefinition[] = [
    {
      role: 'visitor',
      howToObtain: 'No membership is required.',
      responsibilities: ['Respect the rules for public community spaces.'],
      actions: ['Read public material', 'Request membership'],
      permissions: ['community.readPublic', 'membership.request'],
    },
    {
      role: 'member',
      howToObtain: admission,
      responsibilities: [
        'Participate constructively',
        'Follow community decisions',
        'Disclose conflicts of interest',
      ],
      actions: [
        'Publish and share content',
        'Create proposals',
        'Deliberate and vote',
        'Manage own delegations',
        'Appeal moderation',
        'Leave the community',
      ],
      permissions: [...MEMBER_CAPABILITIES],
    },
    {
      role: 'moderator',
      howToObtain: moderator,
      responsibilities: [
        'Enforce community rules',
        'Manage reports',
        'Facilitate proceedings',
        'Document interventions',
      ],
      actions: [
        'Hide or restore content',
        'Manage briefing packs',
        'Suspend a member for up to seven days',
        'Execute approved decisions',
        'Propose permanent sanctions',
      ],
      permissions: [...MEMBER_CAPABILITIES, ...MODERATOR_CAPABILITIES],
    },
    {
      role: 'assembly',
      howToObtain: 'Every active member belongs to the assembly.',
      responsibilities: [
        'Decide protected actions',
        'Hold officeholders accountable',
      ],
      actions: [
        'Approve gated admission',
        'Elect and recall moderators',
        'Decide permanent sanctions and appeals',
        'Approve budgets and constitutional changes',
      ],
      permissions: [],
    },
  ]
  if (standard === 'hierarchical') {
    definitions.splice(3, 0, {
      role: 'owner',
      howToObtain:
        'Found the community or accept a transfer from the current owner.',
      responsibilities: [
        'Maintain community configuration',
        'Appoint moderators',
        'Execute governance decisions',
        'Preserve continuity',
      ],
      actions: [
        'Manage routine settings',
        'Grant or revoke moderator roles',
        'Transfer ownership',
        'Propose and execute governance changes',
      ],
      permissions: [
        ...MEMBER_CAPABILITIES,
        ...MODERATOR_CAPABILITIES,
        ...OWNER_CAPABILITIES,
      ],
    })
  }
  return definitions
}

export function resolveCapabilities(roles: readonly CommunityRole[]): string[] {
  const capabilities = new Set<string>([
    'community.readPublic',
    'membership.request',
  ])
  if (roles.includes('member')) {
    MEMBER_CAPABILITIES.forEach((capability) => capabilities.add(capability))
  }
  if (roles.includes('moderator') || roles.includes('owner')) {
    MODERATOR_CAPABILITIES.forEach((capability) => capabilities.add(capability))
  }
  if (roles.includes('owner')) {
    OWNER_CAPABILITIES.forEach((capability) => capabilities.add(capability))
  }
  return [...capabilities]
}

export function resolveAvailableAction(
  action: string,
  roles: readonly CommunityRole[],
  standard: OrganizationStandard,
): AvailableAction {
  const capabilities = resolveCapabilities(roles)
  if (capabilities.includes(action)) {
    return { action, status: 'allowed', policy: 'single_actor' }
  }
  const protectedActions: Record<string, string> = {
    'membership.approve': 'assembly_majority',
    'member.remove':
      standard === 'horizontal'
        ? 'assembly_majority'
        : 'owner_after_moderator_proposal',
    'member.block':
      standard === 'horizontal'
        ? 'assembly_majority'
        : 'owner_after_moderator_proposal',
    'moderator.elect':
      standard === 'horizontal' ? 'assembly_majority' : 'owner_appointment',
    'moderator.recall':
      standard === 'horizontal' ? 'assembly_majority' : 'owner_action',
    'moderation.appeal':
      standard === 'horizontal' ? 'assembly_majority' : 'owner_review',
    'budget.approve': 'assembly_majority',
    'governance.amend': 'assembly_supermajority',
    'organization.change': 'assembly_supermajority',
    'admission.change': 'assembly_supermajority',
    'owner.recover': 'assembly_supermajority',
  }
  const policy = protectedActions[action]
  if (policy && roles.includes('member')) {
    return { action, status: 'requires_approval', policy }
  }
  return {
    action,
    status: 'denied',
    policy: 'role_required',
    reason: 'The current verified roles do not permit this action.',
  }
}

export function deriveEffectiveAuthority(
  events: readonly CommunityAuthorityEvent[],
  now = Date.now(),
): EffectiveAuthority {
  let membershipState: EffectiveAuthority['membershipState'] = 'none'
  const evidence: EffectiveAuthority['evidence'] = {}
  const active = new Set<CommunityRole>()
  const ordered = [...events].sort((a, b) => {
    const version = a.version - b.version
    return version || a.uri.localeCompare(b.uri)
  })
  for (const event of ordered) {
    const effectiveAt = Date.parse(event.effectiveAt)
    const expiresAt = event.expiresAt ? Date.parse(event.expiresAt) : Infinity
    if (effectiveAt > now || expiresAt <= now) continue
    if (event.action === 'member.activate') {
      membershipState = 'active'
      active.add('member')
      evidence.member = event
    } else if (event.action === 'member.reinstate') {
      membershipState = 'active'
      active.add('member')
      evidence.member = event
    } else if (event.action === 'member.suspend') {
      membershipState = 'suspended'
      active.clear()
    } else if (event.action === 'member.remove') {
      membershipState = 'removed'
      active.clear()
    } else if (event.action === 'member.block') {
      membershipState = 'blocked'
      active.clear()
    } else if (event.action === 'moderator.grant') {
      if (membershipState === 'active') {
        active.add('moderator')
        evidence.moderator = event
      }
    } else if (
      event.action === 'moderator.revoke' ||
      event.action === 'moderator.resign'
    ) {
      active.delete('moderator')
      delete evidence.moderator
    } else if (event.action === 'owner.grant') {
      if (membershipState === 'active') {
        active.add('owner')
        evidence.owner = event
      }
    } else if (event.action === 'owner.revoke') {
      active.delete('owner')
      delete evidence.owner
    }
  }
  return { membershipState, roles: [...active], evidence }
}
