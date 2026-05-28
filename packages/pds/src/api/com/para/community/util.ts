// @ts-nocheck
import { AtUri } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import { ActorStoreReader } from '../../../../actor-store/actor-store-reader.js'
import { ActorStoreTransactor } from '../../../../actor-store/actor-store-transactor.js'
import * as ComParaCommunityBoard from '../../../../lexicon/types/com/para/community/board.js'
import * as ComParaCommunityGetBoard from '../../../../lexicon/types/com/para/community/getBoard.js'
import * as ComParaCommunityGovernance from '../../../../lexicon/types/com/para/community/governance.js'
import * as ComParaCommunityListBoards from '../../../../lexicon/types/com/para/community/listBoards.js'
import * as ComParaCommunityMembership from '../../../../lexicon/types/com/para/community/membership.js'

export const BOARD_COLLECTION = 'com.para.community.board'
export const MEMBERSHIP_COLLECTION = 'com.para.community.membership'
export const GOVERNANCE_COLLECTION = 'com.para.community.governance'
export const SHARED_CONTENT_COLLECTION = 'com.para.community.sharedContent'
export const SHARED_CONTENT_ACTION_COLLECTION =
  'com.para.community.sharedContentAction'
export const COMMUNITY_RELATION_COLLECTION = 'com.para.community.relation'

export const LIST_COLLECTION = 'app.bsky.graph.list'
export const STARTERPACK_COLLECTION = 'app.bsky.graph.starterpack'
export const LIST_ITEM_COLLECTION = 'app.bsky.graph.listitem'

export const DEFAULT_MODERATOR_CAPABILITIES = [
  'appoint_deputies',
  'edit_role_descriptions',
  'review_applicants',
  'publish_governance_updates',
  'set_official_representatives',
]

export const COMMUNITY_MEMBER_CAPABILITIES = ['leave_community']
export const COMMUNITY_NON_MEMBER_CAPABILITIES = ['join_community']
export const COMMUNITY_MODERATOR_CAPABILITIES = [
  'manage_governance',
  'review_members',
  'remove_members',
  'edit_community',
]
export const GLOBAL_COMMUNITY_CAPABILITIES = ['create_community']

export type LocalBoard = {
  uri: string
  cid: string
  record: ComParaCommunityBoard.Record
}

export type LocalGovernanceRecord = ComParaCommunityGovernance.Record

export const normalizeCommunityName = (value: string) => value.trim()

export const normalizeQuadrant = (value: string) => value.trim()

export const normalizeSlug = (value: string) =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const deriveBoardSlug = (name: string, rkey: string) => {
  const base = normalizeSlug(name)
  return base ? `${base}-${rkey}` : `community-${rkey}`
}

export const buildDelegatesChatId = (boardRkey: string) =>
  `para://community/${boardRkey}/delegates`

export const buildSubdelegatesChatId = (boardRkey: string) =>
  `para://community/${boardRkey}/subdelegates`

export const buildSeedGovernanceRecord = ({
  did,
  name,
  slug,
  createdAt,
  governanceMode,
}: {
  did: string
  name: string
  slug: string
  createdAt: string
  governanceMode?: string
}): ComParaCommunityGovernance.Record => {
  const isHorizontal = governanceMode === 'horizontal'
  const moderatorMaxDays = isHorizontal ? 30 : undefined
  const validUntil = isHorizontal
    ? new Date(Date.now() + (moderatorMaxDays ?? 30) * 86400000).toISOString()
    : undefined

  return {
    $type: GOVERNANCE_COLLECTION,
    community: `p/${name}`,
    communityId: slug,
    slug,
    createdAt,
    updatedAt: createdAt,
    moderators: [
      {
        did,
        role: isHorizontal ? 'Founding facilitator' : 'Founding moderator',
        badge: 'Community Creator',
        capabilities: DEFAULT_MODERATOR_CAPABILITIES,
        validFrom: createdAt,
        validUntil,
      },
    ],
    officials: [],
    deputies: [],
    roleRotationRules: isHorizontal
      ? {
          $type: 'com.para.community.governanceConfig#roleRotationRules',
          facilitatorMaxDays: 30,
          moderatorMaxDays: 90,
          stewardMaxDays: 180,
          requiresAssemblyRatification: true,
        }
      : undefined,
    metadata: {
      state: 'seeded',
      reviewCadence: 'Initial setup',
      lastPublishedAt: createdAt,
    },
    editHistory: [
      {
        id: 'seed-governance',
        action: 'publish_governance_updates',
        actorDid: did,
        createdAt,
        summary: isHorizontal
          ? 'Initial horizontal governance charter seeded during community creation.'
          : 'Initial governance charter seeded during community creation.',
      },
    ],
  }
}

export const listLocalBoards = async (
  store: ActorStoreReader,
  limit = 50,
): Promise<LocalBoard[]> => {
  const records = await store.record.listRecordsForCollection({
    collection: BOARD_COLLECTION,
    limit,
    reverse: false,
    includeSoftDeleted: true,
  })

  return records.flatMap((record) => {
    const validated = ComParaCommunityBoard.validateRecord(record.value)
    if (!validated.success) return []
    return [
      {
        uri: record.uri,
        cid: record.cid,
        record: validated.value,
      },
    ]
  })
}

export const findMatchingBoardByIdentity = async ({
  store,
  name,
  quadrant,
}: {
  store: ActorStoreReader
  name: string
  quadrant: string
}): Promise<LocalBoard | null> => {
  const normalizedName = normalizeSlug(name)
  const normalizedQuadrant = normalizeSlug(quadrant)
  const boards = await listLocalBoards(store, 100)

  return (
    boards.find((board) => {
      return (
        normalizeSlug(board.record.name) === normalizedName &&
        normalizeSlug(board.record.quadrant) === normalizedQuadrant
      )
    }) ?? null
  )
}

export const findLocalBoard = async ({
  store,
  uri,
  communityId,
}: {
  store: ActorStoreReader
  uri?: string
  communityId?: string
}): Promise<LocalBoard | null> => {
  if (uri) {
    let parsed: AtUri
    try {
      parsed = new AtUri(uri)
    } catch {
      return null
    }
    const record = await store.record.getRecord(parsed, null, true)
    if (!record) return null
    const validated = ComParaCommunityBoard.validateRecord(record.value)
    if (!validated.success) return null
    return {
      uri: parsed.toString(),
      cid: record.cid,
      record: validated.value,
    }
  }

  if (!communityId) return null
  const boards = await listLocalBoards(store, 100)
  return (
    boards.find((board) => {
      const boardUri = new AtUri(board.uri)
      return deriveBoardSlug(board.record.name, boardUri.rkey) === communityId
    }) ?? null
  )
}

export const getLocalMembership = async ({
  store,
  viewerDid,
  boardUri,
}: {
  store: ActorStoreReader
  viewerDid: string
  boardUri: string
}): Promise<ComParaCommunityMembership.Record | null> => {
  const board = new AtUri(boardUri)
  const membershipUri = AtUri.make(viewerDid, MEMBERSHIP_COLLECTION, board.rkey)
  const recordStore = store.record ?? store
  const membership = await recordStore.getRecord(membershipUri, null, true)
  if (!membership) return null
  const validated = ComParaCommunityMembership.validateRecord(membership.value)
  return validated.success ? validated.value : null
}

export const getMembershipUriForBoard = ({
  viewerDid,
  boardUri,
}: {
  viewerDid: string
  boardUri: string
}) => {
  const board = new AtUri(boardUri)
  return AtUri.make(viewerDid, MEMBERSHIP_COLLECTION, board.rkey)
}

export const assertCommunityBoardUri = (value: string) => {
  const uri = new AtUri(value)
  if (uri.collection !== BOARD_COLLECTION || !uri.rkey) {
    throw new Error(`communityUri must reference a ${BOARD_COLLECTION} record.`)
  }
  return uri
}

export const isActiveMembership = (
  membership: ComParaCommunityMembership.Record | null | undefined,
) => membership?.membershipState === 'active'

export const getValidRoles = (
  membership?: ComParaCommunityMembership.Record | null,
): string[] => {
  if (!membership) return []
  const now = Date.now()

  // Prefer structured roleAssignments if present
  if (membership.roleAssignments && membership.roleAssignments.length > 0) {
    return membership.roleAssignments
      .filter((assignment) => {
        if (assignment.validFrom && Date.parse(assignment.validFrom) > now)
          return false
        if (assignment.validUntil && Date.parse(assignment.validUntil) <= now)
          return false
        return true
      })
      .map((assignment) => assignment.role)
  }

  // Fall back to legacy roles array
  return membership.roles ?? []
}

export const isCommunitySteward = (
  membership: ComParaCommunityMembership.Record | null | undefined,
) => {
  if (!isActiveMembership(membership)) return false
  const roles = getValidRoles(membership)
  return roles.some((role) =>
    ['owner', 'moderator', 'steward', 'official'].includes(role),
  )
}

export const getViewerCapabilities = (
  membership?: ComParaCommunityMembership.Record | null,
) => {
  const capabilities = new Set<string>(GLOBAL_COMMUNITY_CAPABILITIES)
  const state = membership?.membershipState ?? 'none'
  const roles = getValidRoles(membership)

  if (state === 'active') {
    COMMUNITY_MEMBER_CAPABILITIES.forEach((capability) =>
      capabilities.add(capability),
    )
  } else if (state === 'none' || state === 'left') {
    COMMUNITY_NON_MEMBER_CAPABILITIES.forEach((capability) =>
      capabilities.add(capability),
    )
  }

  if (
    state === 'active' &&
    (roles.includes('owner') || roles.includes('moderator'))
  ) {
    COMMUNITY_MODERATOR_CAPABILITIES.forEach((capability) =>
      capabilities.add(capability),
    )
  }

  return Array.from(capabilities)
}

export const getLocalGovernance = async ({
  store,
  creatorDid,
  board,
}: {
  store: ActorStoreReader
  creatorDid: string
  board: LocalBoard
}): Promise<LocalGovernanceRecord | null> => {
  const boardUri = new AtUri(board.uri)
  const governanceUri = AtUri.make(
    creatorDid,
    GOVERNANCE_COLLECTION,
    deriveBoardSlug(board.record.name, boardUri.rkey),
  )
  const governance = await store.record.getRecord(governanceUri, null, true)
  if (!governance) return null
  const validated = ComParaCommunityGovernance.validateRecord(governance.value)
  return validated.success ? validated.value : null
}

export const getFoundingMemberCount = async ({
  store,
  board,
}: {
  store: ActorStoreReader
  board: LocalBoard
}): Promise<number> => {
  const founderStarterPackUri = board.record.founderStarterPackUri
  if (!founderStarterPackUri) {
    return 0
  }

  let starterPackUri: AtUri
  try {
    starterPackUri = new AtUri(founderStarterPackUri)
  } catch {
    return 0
  }

  const starterPack = await store.record.getRecord(starterPackUri, null, true)
  if (!starterPack) {
    return 0
  }

  const listUri =
    starterPack.value &&
    typeof starterPack.value === 'object' &&
    'list' in starterPack.value &&
    typeof starterPack.value.list === 'string'
      ? starterPack.value.list
      : undefined
  if (!listUri) {
    return 0
  }
  const listItems = await store.record.listRecordsForCollection({
    collection: LIST_ITEM_COLLECTION,
    limit: 100,
    reverse: false,
    includeSoftDeleted: true,
  })

  return listItems.filter((item) => {
    return item.value && (item.value as { list?: string }).list === listUri
  }).length
}

const buildBoardViewShape = ({
  board,
  creatorDid,
  creatorHandle,
  creatorDisplayName,
  viewerMembershipState,
  viewerRoles,
  memberCount,
}: {
  board: LocalBoard
  creatorDid: string
  creatorHandle?: string
  creatorDisplayName?: string
  viewerMembershipState?: string
  viewerRoles?: string[]
  memberCount?: number
}) => {
  const boardUri = new AtUri(board.uri)
  const slug = deriveBoardSlug(board.record.name, boardUri.rkey)

  return {
    uri: board.uri,
    cid: board.cid,
    creatorDid,
    creatorHandle,
    creatorDisplayName,
    communityId: slug,
    slug,
    name: board.record.name,
    description: board.record.description,
    quadrant: board.record.quadrant,
    delegatesChatId: board.record.delegatesChatId,
    subdelegatesChatId: board.record.subdelegatesChatId,
    memberCount: memberCount ?? 0,
    viewerMembershipState:
      (viewerMembershipState as
        | 'none'
        | 'pending'
        | 'active'
        | 'left'
        | 'removed'
        | 'blocked') ?? 'none',
    viewerRoles,
    status: board.record.status,
    founderStarterPackUri: board.record.founderStarterPackUri,
    governanceMode: board.record.governanceMode,
    createdAt: board.record.createdAt,
  }
}

export const toGetBoardView = (args: {
  board: LocalBoard
  creatorDid: string
  creatorHandle?: string
  creatorDisplayName?: string
  viewerMembershipState?: string
  viewerRoles?: string[]
  memberCount?: number
}): ComParaCommunityGetBoard.BoardView => buildBoardViewShape(args)

export const toListBoardView = (args: {
  board: LocalBoard
  creatorDid: string
  creatorHandle?: string
  creatorDisplayName?: string
  viewerMembershipState?: string
  viewerRoles?: string[]
  memberCount?: number
}): ComParaCommunityListBoards.BoardView => buildBoardViewShape(args)

const isRoleValid = (
  entry: Record<string, unknown>,
  now: number,
): boolean => {
  const validFrom = entry.validFrom
    ? Date.parse(entry.validFrom as string)
    : 0
  const validUntil = entry.validUntil
    ? Date.parse(entry.validUntil as string)
    : Infinity
  if (validFrom > now) return false
  if (validUntil <= now) return false
  return true
}

export const assertHorizontalGovernanceWrite = async ({
  actorTxn,
  did,
  record,
}: {
  actorTxn: ActorStoreTransactor
  did: string
  record: Record<string, unknown>
}): Promise<void> => {
  const communityId = (record.slug || record.communityId) as string | undefined
  if (!communityId) return

  const boards = await actorTxn.record.listRecordsForCollection({
    collection: BOARD_COLLECTION,
    limit: 100,
    reverse: false,
    includeSoftDeleted: true,
  })

  const matchingBoard = boards.find((b) => {
    const validated = ComParaCommunityBoard.validateRecord(b.value)
    if (!validated.success) return false
    const bUri = new AtUri(b.uri)
    return deriveBoardSlug(validated.value.name, bUri.rkey) === communityId
  })

  if (!matchingBoard) return

  const boardRecord = ComParaCommunityBoard.validateRecord(matchingBoard.value)
  if (!boardRecord.success) return
  if (boardRecord.value.governanceMode !== 'horizontal') return

  // Horizontal community — check facilitator authorization
  const governanceUri = AtUri.make(did, GOVERNANCE_COLLECTION, communityId)
  const existingGovernance = await actorTxn.record.getRecord(
    governanceUri,
    null,
    true,
  )

  if (!existingGovernance) {
    throw new InvalidRequestError(
      'Horizontal community governance must be created through the community creation flow.',
    )
  }

  const gov = existingGovernance.value as Record<string, unknown>
  const now = Date.now()

  // Check actor's own moderator role is still valid
  const moderators = (gov.moderators || []) as Array<Record<string, unknown>>
  const actorModerator = moderators.find(
    (m) => m.did === did && isRoleValid(m, now),
  )

  if (!actorModerator) {
    throw new InvalidRequestError(
      'Only elected facilitators with valid, unexpired terms can modify governance for horizontal communities.',
    )
  }

  const capabilities = (actorModerator.capabilities || []) as string[]
  if (!capabilities.includes('publish_governance_updates')) {
    throw new InvalidRequestError(
      'Only facilitators with publish_governance_updates capability can modify horizontal community governance.',
    )
  }

  // Validate proposed record role entries have expiration bounds
  const rotationRules = (gov.roleRotationRules || {}) as Record<string, unknown>
  const proposedModerators = (record.moderators || []) as Array<
    Record<string, unknown>
  >
  const proposedOfficials = (record.officials || []) as Array<
    Record<string, unknown>
  >
  const proposedDeputies = (record.deputies || []) as Array<
    Record<string, unknown>
  >

  const maxDaysMap: Record<string, number | undefined> = {
    facilitator: (rotationRules.facilitatorMaxDays as number) || 30,
    moderator: (rotationRules.moderatorMaxDays as number) || 90,
    steward: (rotationRules.stewardMaxDays as number) || 180,
    official: (rotationRules.stewardMaxDays as number) || 180,
    deputy: (rotationRules.moderatorMaxDays as number) || 90,
  }

  const allRoleEntries = [
    ...proposedModerators.map((entry) => ({ entry, roleKey: 'moderator' })),
    ...proposedOfficials.map((entry) => ({ entry, roleKey: 'official' })),
    ...proposedDeputies.map((entry) => ({ entry, roleKey: 'deputy' })),
  ]

  // First pass: structural validation (validUntil presence, expiration, term limits)
  for (const { entry, roleKey } of allRoleEntries) {
    const validUntil = entry.validUntil
      ? Date.parse(entry.validUntil as string)
      : undefined
    const validFrom = entry.validFrom
      ? Date.parse(entry.validFrom as string)
      : now

    if (!validUntil || Number.isNaN(validUntil)) {
      throw new InvalidRequestError(
        `Horizontal governance requires ${roleKey} entries to specify a validUntil date.`,
      )
    }

    if (validUntil <= now) {
      throw new InvalidRequestError(
        `Horizontal governance ${roleKey} entries must have a validUntil date in the future.`,
      )
    }

    const role =
      (entry.role as string) ||
      (entry.office as string) ||
      roleKey
    const maxDays =
      maxDaysMap[role.toLowerCase()] || maxDaysMap[roleKey.toLowerCase()] || 365
    const maxMs = maxDays * 86400000

    if (validUntil - validFrom > maxMs) {
      throw new InvalidRequestError(
        `${roleKey} term exceeds maximum allowed duration of ${maxDays} days for horizontal governance.`,
      )
    }
  }

  // Second pass: policy validation (assembly ratification)
  if (rotationRules.requiresAssemblyRatification) {
    for (const { entry, roleKey } of allRoleEntries) {
      if (!entry.ratifiedBy) {
        throw new InvalidRequestError(
          `Horizontal governance requires assembly ratification (ratifiedBy) for ${roleKey} changes.`,
        )
      }
    }
  }
}

export const toGovernanceSummary = (
  governance: LocalGovernanceRecord | null,
): ComParaCommunityGetBoard.GovernanceSummary | undefined => {
  if (!governance) return undefined
  return {
    moderatorCount: governance.moderators.length,
    officialCount: governance.officials.length,
    deputyRoleCount: governance.deputies.length,
    lastPublishedAt:
      governance.metadata?.lastPublishedAt ||
      governance.updatedAt ||
      governance.createdAt,
  }
}
