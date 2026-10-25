import type { CidString } from '@atproto/lex'
import type { LexMap } from '@atproto/lex-data'
import {
  AtUri,
  type AtUriString,
  type DatetimeString,
  type DidString,
} from '@atproto/syntax'
import { WriteOpAction } from '@atproto/repo'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { ActorStoreReader } from '../../../../actor-store/actor-store-reader.js'
import type { ActorStoreTransactor } from '../../../../actor-store/actor-store-transactor.js'
import type { RecordReader } from '../../../../actor-store/record/reader.js'
import type { com } from '../../../../lexicons/index.js'
import type { PreparedWrite } from '../../../../repo/index.js'

export const BOARD_COLLECTION = 'com.para.community.board'
export const MEMBERSHIP_COLLECTION = 'com.para.community.membership'
export const GOVERNANCE_COLLECTION = 'com.para.community.governance'
export const AUTHORITY_EVENT_COLLECTION = 'com.para.community.authorityEvent'
export const SHARED_CONTENT_COLLECTION = 'com.para.community.sharedContent'
export const SHARED_CONTENT_ACTION_COLLECTION =
  'com.para.community.sharedContentAction'

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

/*
 * The board, membership and governance record lexicons are not part of this
 * PDS's lexicon manifest (adding them would change how createRecord validates
 * those collections), so these are structural views of the fields read here.
 */

export type BoardRecord = LexMap & {
  $type: typeof BOARD_COLLECTION
  name: string
  quadrant: string
  description?: string
  region?: string
  delegatesChatId: string
  subdelegatesChatId: string
  status: string
  founderStarterPackUri?: string
  governanceMode?: string
  admissionMode?: string
  createdAt: string
}

export type RoleAssignment = {
  role: string
  validFrom?: string
  validUntil?: string
}

export type MembershipRecord = {
  $type?: typeof MEMBERSHIP_COLLECTION
  community: string
  membershipState: string
  roles?: string[]
  roleAssignments?: RoleAssignment[]
  source?: string
  joinedAt: string
  leftAt?: string
}

export type GovernanceRecord = {
  moderators: unknown[]
  officials: unknown[]
  deputies: unknown[]
  createdAt: string
  updatedAt: string
  metadata?: { lastPublishedAt?: string }
}

export type LocalBoard = {
  uri: string
  cid: string
  record: BoardRecord
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const asBoardRecord = (value: unknown): BoardRecord | null => {
  if (!isObject(value) || value.$type !== BOARD_COLLECTION) return null
  if (typeof value.name !== 'string' || typeof value.quadrant !== 'string') {
    return null
  }
  return value as BoardRecord
}

export const asMembershipRecord = (value: unknown): MembershipRecord | null => {
  if (!isObject(value) || value.$type !== MEMBERSHIP_COLLECTION) return null
  if (
    typeof value.community !== 'string' ||
    typeof value.membershipState !== 'string'
  ) {
    return null
  }
  return value as MembershipRecord
}

export const asGovernanceRecord = (value: unknown): GovernanceRecord | null => {
  if (!isObject(value) || value.$type !== GOVERNANCE_COLLECTION) return null
  if (
    !Array.isArray(value.moderators) ||
    !Array.isArray(value.officials) ||
    !Array.isArray(value.deputies)
  ) {
    return null
  }
  return value as GovernanceRecord
}

export const normalizeCommunityName = (value: string) => value.trim()

export const normalizeQuadrant = (value: string) => value.trim()

export const normalizeSlug = (value: string) =>
  value
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
}): LexMap => {
  const isHorizontal = governanceMode === 'horizontal'
  const validUntil = isHorizontal
    ? new Date(Date.now() + 30 * 86400000).toISOString()
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

const listBoardRecords = async (store: { record: RecordReader }, limit = 100) =>
  store.record.listRecordsForCollection({
    collection: BOARD_COLLECTION,
    limit,
    reverse: false,
    includeSoftDeleted: true,
  })

export const listLocalBoards = async (
  store: ActorStoreReader,
  limit = 50,
): Promise<LocalBoard[]> => {
  const records = await listBoardRecords(store, limit)
  return records.flatMap((record) => {
    const board = asBoardRecord(record.value)
    return board ? [{ uri: record.uri, cid: record.cid, record: board }] : []
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
    boards.find(
      (board) =>
        normalizeSlug(board.record.name) === normalizedName &&
        normalizeSlug(board.record.quadrant) === normalizedQuadrant,
    ) ?? null
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
    const board = record && asBoardRecord(record.value)
    if (!record || !board) return null
    return { uri: parsed.toString(), cid: record.cid, record: board }
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

export const getLocalMembership = async ({
  store,
  viewerDid,
  boardUri,
}: {
  store: { record: RecordReader }
  viewerDid: string
  boardUri: string
}): Promise<MembershipRecord | null> => {
  const membershipUri = getMembershipUriForBoard({ viewerDid, boardUri })
  const membership = await store.record.getRecord(membershipUri, null, true)
  return membership ? asMembershipRecord(membership.value) : null
}

export const assertCommunityBoardUri = (value: string) => {
  let uri: AtUri
  try {
    uri = new AtUri(value)
  } catch {
    throw new InvalidRequestError('communityUri must be a valid AT URI.')
  }
  if (uri.collection !== BOARD_COLLECTION || !uri.rkey) {
    throw new InvalidRequestError(
      `communityUri must reference a ${BOARD_COLLECTION} record.`,
    )
  }
  return uri
}

export const assertAuthorityEventWrite = ({
  did,
  record,
}: {
  did: string
  record: Record<string, unknown>
}) => {
  if (record.issuer !== did) {
    throw new InvalidRequestError(
      'Authority event issuer must match the repository owner.',
    )
  }
  if (record.basis === 'migration') {
    throw new InvalidRequestError(
      'Migration authority events are service generated.',
    )
  }
  const effectiveAt = Date.parse(String(record.effectiveAt || ''))
  const createdAt = Date.parse(String(record.createdAt || ''))
  if (!Number.isFinite(effectiveAt) || !Number.isFinite(createdAt)) {
    throw new InvalidRequestError('Authority events require valid timestamps.')
  }
  if (!Number.isInteger(record.version) || Number(record.version) < 1) {
    throw new InvalidRequestError(
      'Authority event version must be a positive integer.',
    )
  }
  const action = String(record.action || '')
  const basis = String(record.basis || '')
  const subject = String(record.subject || '')
  if (
    (basis === 'openAdmission' || basis === 'resignation') &&
    subject !== did
  ) {
    throw new InvalidRequestError(
      'This authority event must be authored by its subject.',
    )
  }
  if (
    ['assemblyDecision', 'ownerAppointment', 'ownerTransfer'].includes(basis) &&
    !record.evidence
  ) {
    throw new InvalidRequestError(
      'This authority event requires verifiable evidence.',
    )
  }
  if (basis === 'resignation' && action !== 'moderator.resign') {
    throw new InvalidRequestError(
      'A resignation event may only resign a moderator role.',
    )
  }
  if (action === 'moderator.grant' && record.expiresAt) {
    const expiresAt = Date.parse(String(record.expiresAt))
    if (!Number.isFinite(expiresAt) || expiresAt <= effectiveAt) {
      throw new InvalidRequestError(
        'Moderator expiry must be after its effective time.',
      )
    }
  }
}

export const isActiveMembership = (
  membership: MembershipRecord | null | undefined,
) => membership?.membershipState === 'active'

export const getValidRoles = (
  membership?: MembershipRecord | null,
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
  membership: MembershipRecord | null | undefined,
) => {
  if (!isActiveMembership(membership)) return false
  const roles = getValidRoles(membership)
  return roles.some((role) =>
    ['owner', 'moderator', 'steward', 'official'].includes(role),
  )
}

export const getViewerCapabilities = (
  membership?: Pick<
    MembershipRecord,
    'membershipState' | 'roles' | 'roleAssignments'
  > | null,
) => {
  const capabilities = new Set<string>(GLOBAL_COMMUNITY_CAPABILITIES)
  const state = membership?.membershipState ?? 'none'
  const roles = getValidRoles(membership as MembershipRecord | null)

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
  creatorDid: DidString
  board: LocalBoard
}): Promise<GovernanceRecord | null> => {
  const boardUri = new AtUri(board.uri)
  const governanceUri = AtUri.make(
    creatorDid,
    GOVERNANCE_COLLECTION,
    deriveBoardSlug(board.record.name, boardUri.rkey),
  )
  const governance = await store.record.getRecord(governanceUri, null, true)
  return governance ? asGovernanceRecord(governance.value) : null
}

export const getFoundingMemberCount = async ({
  store,
  board,
}: {
  store: ActorStoreReader
  board: LocalBoard
}): Promise<number> => {
  const founderStarterPackUri = board.record.founderStarterPackUri
  if (!founderStarterPackUri) return 0

  let starterPackUri: AtUri
  try {
    starterPackUri = new AtUri(founderStarterPackUri)
  } catch {
    return 0
  }

  const starterPack = await store.record.getRecord(starterPackUri, null, true)
  const listUri = starterPack?.value.list
  if (typeof listUri !== 'string') return 0

  const listItems = await store.record.listRecordsForCollection({
    collection: LIST_ITEM_COLLECTION,
    limit: 100,
    reverse: false,
    includeSoftDeleted: true,
  })
  return listItems.filter((item) => item.value.list === listUri).length
}

type BoardViewArgs = {
  board: LocalBoard
  creatorDid: DidString
  viewerMembershipState?: string
  viewerRoles?: string[]
  memberCount?: number
}

const buildBoardViewShape = ({
  board,
  creatorDid,
  viewerMembershipState,
  viewerRoles,
  memberCount,
}: BoardViewArgs) => {
  const boardUri = new AtUri(board.uri)
  const slug = deriveBoardSlug(board.record.name, boardUri.rkey)

  return {
    uri: board.uri as AtUriString,
    cid: board.cid as CidString,
    creatorDid,
    communityId: slug,
    slug,
    name: board.record.name,
    description: board.record.description,
    quadrant: board.record.quadrant,
    region: board.record.region,
    delegatesChatId: board.record.delegatesChatId,
    subdelegatesChatId: board.record.subdelegatesChatId,
    memberCount: memberCount ?? 0,
    viewerMembershipState: viewerMembershipState ?? 'none',
    viewerRoles,
    status: board.record.status,
    founderStarterPackUri: board.record.founderStarterPackUri as
      | AtUriString
      | undefined,
    governanceMode: board.record.governanceMode,
    admissionMode: board.record.admissionMode,
    createdAt: board.record.createdAt as DatetimeString,
  }
}

export const toGetBoardView = (
  args: BoardViewArgs,
): com.para.community.getBoard.BoardView => buildBoardViewShape(args)

export const toListBoardView = (
  args: BoardViewArgs,
): com.para.community.listBoards.BoardView => buildBoardViewShape(args)

const isRoleValid = (entry: Record<string, unknown>, now: number): boolean => {
  const validFrom = entry.validFrom ? Date.parse(entry.validFrom as string) : 0
  const validUntil = entry.validUntil
    ? Date.parse(entry.validUntil as string)
    : Infinity
  if (validFrom > now) return false
  if (validUntil <= now) return false
  return true
}

/**
 * Governance of a horizontal community may only be changed by a facilitator
 * with a valid, unexpired term, and every role entry must carry a bounded,
 * ratified term. Applied to every governance write that reaches this PDS
 * (createRecord, putRecord, applyWrites).
 */
export const assertHorizontalGovernanceWrite = async ({
  actorTxn,
  did,
  record,
}: {
  actorTxn: ActorStoreTransactor
  did: DidString
  record: Record<string, unknown>
}): Promise<void> => {
  const communityId = (record.slug || record.communityId) as string | undefined
  if (!communityId) return

  const boards = await listBoardRecords(actorTxn)
  let matchingBoard: BoardRecord | undefined
  for (const b of boards) {
    const board = asBoardRecord(b.value)
    if (!board) continue
    if (deriveBoardSlug(board.name, new AtUri(b.uri).rkey) === communityId) {
      matchingBoard = board
      break
    }
  }

  if (!matchingBoard) return
  if (matchingBoard.governanceMode !== 'horizontal') return

  // Horizontal community: check facilitator authorization
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
      (entry.role as string) || (entry.office as string) || roleKey
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
  governance: GovernanceRecord | null,
): com.para.community.getBoard.GovernanceSummary | undefined => {
  if (!governance) return undefined
  return {
    moderatorCount: governance.moderators.length,
    officialCount: governance.officials.length,
    deputyRoleCount: governance.deputies.length,
    lastPublishedAt: (governance.metadata?.lastPublishedAt ||
      governance.updatedAt ||
      governance.createdAt) as DatetimeString,
  }
}

/**
 * PARA's community write rules for generic repo writes (createRecord,
 * putRecord, applyWrites, deleteRecord): authority events are append-only and
 * self-issued, and horizontal-community governance goes through
 * {@link assertHorizontalGovernanceWrite}. Call inside the write transaction.
 */
export const assertCommunityRepoWrites = async (
  actorTxn: ActorStoreTransactor,
  did: DidString,
  writes: PreparedWrite[],
) => {
  for (const write of writes) {
    const { collection } = write.uri
    if (collection === AUTHORITY_EVENT_COLLECTION) {
      if (write.action !== WriteOpAction.Create) {
        throw new InvalidRequestError('Authority events are immutable.')
      }
      assertAuthorityEventWrite({ did, record: write.record })
    } else if (
      collection === GOVERNANCE_COLLECTION &&
      write.action !== WriteOpAction.Delete
    ) {
      await assertHorizontalGovernanceWrite({
        actorTxn,
        did,
        record: write.record,
      })
    }
  }
}
