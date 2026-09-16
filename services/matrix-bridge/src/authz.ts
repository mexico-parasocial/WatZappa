import type { RouteContext } from './routes/context.js'
import type { ServerResponse } from 'node:http'
import { HttpError } from './m8-auth.js'
import { writeJson } from './routes/http.js'

/**
 * F9 remediation: central, testable authorization for the bridge's API.
 *
 * `authorize(actor, action, resource)` is the single place where the question
 * "may this DID do this thing to this community/room" is answered. Routes
 * must call it (or a wrapper below) instead of re-deriving permission from
 * raw membership checks — the review's requirement is that community
 * membership alone must not grant moderator powers, cross-chamber reads, or
 * sortition execution.
 */

export type AuthzAction =
  /** Read governance surface: constitution, proposals, decisions, boards. */
  | 'community.read'
  /** Submit moderation reports and deliberation contributions. */
  | 'community.contribute'
  /** Apply sanctions, read full report queues, recompute badges. */
  | 'community.moderate'
  /** Create a sortition (assembly selection) run. */
  | 'sortition.run'
  /** Process/execute a sortition run (selects members). */
  | 'sortition.process'
  /** Read and write read-markers inside a specific room. */
  | 'chamber.read'

export type AuthzResource =
  { kind: 'community'; communityUri: string } | { kind: 'room'; roomId: string }

export type Membership = { state: string; roles: string[] }

const MODERATOR_ROLES = ['moderator', 'owner']
const PROCESS_SORTITION_ROLES = ['moderator', 'owner', 'delegate']

export class AuthzError extends HttpError {
  constructor(message: string) {
    super(403, message)
  }
}

/** Raw policy: given a membership and an action on a community, decide. */
export function decideCommunity(
  membership: Membership | undefined,
  action: AuthzAction,
): { allowed: boolean; reason?: string } {
  if (!membership) return { allowed: false, reason: 'not a member' }
  const active = membership.state === 'active'
  if (!active) return { allowed: false, reason: 'membership not active' }

  switch (action) {
    case 'community.read':
    case 'community.contribute':
    case 'sortition.run':
    case 'chamber.read': // room-level refinement happens in decideRoom
      return { allowed: true }
    case 'community.moderate':
      return membership.roles.some((r) => MODERATOR_ROLES.includes(r))
        ? { allowed: true }
        : { allowed: false, reason: 'moderator or owner role required' }
    case 'sortition.process':
      return membership.roles.some((r) => PROCESS_SORTITION_ROLES.includes(r))
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'moderator, owner or delegate role required',
          }
    default:
      return {
        allowed: false,
        reason: `unknown action ${action satisfies never}`,
      }
  }
}

/** Chamber refinement for room-scoped actions (the F9 cross-chamber rule). */
export function decideRoom(
  membership: Membership | undefined,
  roomKind: 'main' | 'chamber-a' | 'chamber-b' | 'observers',
  assignedChamber: string | undefined,
): { allowed: boolean; reason?: string } {
  const base = decideCommunity(membership, 'chamber.read')
  if (!base.allowed || !membership) return base

  const roles = membership.roles
  if (roles.includes('observer')) {
    // Observers read the observers room and the main room only.
    return roomKind === 'observers' || roomKind === 'main'
      ? { allowed: true }
      : { allowed: false, reason: 'observers cannot access chamber rooms' }
  }

  switch (roomKind) {
    case 'main':
    case 'observers':
      return { allowed: true }
    case 'chamber-a':
    case 'chamber-b': {
      const chamber = roomKind === 'chamber-a' ? 'A' : 'B'
      return assignedChamber === chamber
        ? { allowed: true }
        : { allowed: false, reason: `not assigned to chamber ${chamber}` }
    }
    default:
      return { allowed: false, reason: 'unknown room kind' }
  }
}

/** Resolve the room's community and kind from the stored space map. */
export async function resolveRoom(
  ctx: RouteContext,
  roomId: string,
): Promise<
  | {
      communityUri: string
      roomKind: 'main' | 'chamber-a' | 'chamber-b' | 'observers'
    }
  | undefined
> {
  const community = await ctx.db.getCommunityByRoomId(roomId)
  if (!community) return undefined
  const space = await ctx.db.getSpaceForCommunity(community.communityUri)
  if (!space) return { communityUri: community.communityUri, roomKind: 'main' }
  const roomKind =
    roomId === space.chamberA_RoomId
      ? 'chamber-a'
      : roomId === space.chamberB_RoomId
        ? 'chamber-b'
        : roomId === space.observerRoomId
          ? 'observers'
          : 'main'
  return { communityUri: community.communityUri, roomKind }
}

/**
 * Throws AuthzError (403) unless `actor` may perform `action` on `resource`.
 * Routes call this after authenticateM8.
 */
export async function authorize(
  ctx: RouteContext,
  actor: string,
  action: AuthzAction,
  resource: AuthzResource,
): Promise<void> {
  if (resource.kind === 'community') {
    const membership = await ctx.db.getCommunityMembership(
      actor,
      resource.communityUri,
    )
    const verdict = decideCommunity(membership, action)
    if (!verdict.allowed) {
      throw new AuthzError(
        `Not authorized for ${action} on community: ${verdict.reason}`,
      )
    }
    return
  }

  // room-scoped
  const room = await resolveRoom(ctx, resource.roomId)
  if (!room) {
    throw new AuthzError('Room does not belong to a known community')
  }
  const membership = await ctx.db.getCommunityMembership(
    actor,
    room.communityUri,
  )
  const assignedChamber =
    action === 'chamber.read'
      ? await ctx.db.getChamberAssignment(room.communityUri, actor)
      : undefined
  const verdict = decideRoom(membership, room.roomKind, assignedChamber)
  if (!verdict.allowed) {
    throw new AuthzError(
      `Not authorized for ${action} on room: ${verdict.reason}`,
    )
  }
}

/**
 * authorize() + 403 response in one call: returns false (response written)
 * when denied, true when allowed. Handlers: `if (!(await ...)) return`.
 */
export async function authorizeOrRespond(
  ctx: RouteContext,
  res: ServerResponse,
  actor: string,
  action: AuthzAction,
  resource: AuthzResource,
): Promise<boolean> {
  try {
    await authorize(ctx, actor, action, resource)
    return true
  } catch (err) {
    if (err instanceof HttpError) {
      writeJson(res, err.statusCode, { error: err.message })
      return false
    }
    throw err
  }
}

/** Same contract for authorizeUserRead. */
export async function authorizeUserReadOrRespond(
  ctx: RouteContext,
  res: ServerResponse,
  actor: string,
  targetDid: string,
  communityUri: string,
): Promise<boolean> {
  try {
    await authorizeUserRead(ctx, actor, targetDid, communityUri)
    return true
  } catch (err) {
    if (err instanceof HttpError) {
      writeJson(res, err.statusCode, { error: err.message })
      return false
    }
    throw err
  }
}

/**
 * Reading data *about* another user (their badges, votes, viewer-scoped
 * views): allowed for the user themselves, or for a moderator/owner of the
 * community the data belongs to. Strangers get 403 even when they can read
 * the community itself.
 */
export async function authorizeUserRead(
  ctx: RouteContext,
  actor: string,
  targetDid: string,
  communityUri: string,
): Promise<void> {
  if (actor === targetDid) return
  const membership = await ctx.db.getCommunityMembership(actor, communityUri)
  const verdict = decideCommunity(membership, 'community.moderate')
  if (!verdict.allowed) {
    throw new AuthzError(`Not authorized to read user data: ${verdict.reason}`)
  }
}
