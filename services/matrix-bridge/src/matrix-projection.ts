import type { Logger } from 'pino'
import {
  ChatDisabledError,
  isProvisionedSpace,
  unprovisionedSpaceId,
} from './chat-mode.js'
import { type EffectiveSanction, effectiveSanction } from './chat-moderation.js'
import type { Config } from './config.js'
import type { IBridgeDatabase } from './db/index.js'
import type { CommunitySpaceMap } from './db/interface.js'
import { mxidForIdentityPub } from './identity-proof.js'
import type { MatrixAdminClient } from './matrix.js'

/**
 * A verified join by a member who is banned from the community. Sanctions are
 * recorded against the DID, so presenting a fresh chat key (a fresh MXID) does
 * not escape one: the projection checks the DID, not the account.
 */
export class SanctionedMemberError extends Error {
  readonly code = 'Sanctioned'
  constructor(readonly sanction: EffectiveSanction) {
    super('Member is banned from this community')
  }
}

/**
 * Applies externally verified community access to Matrix. Callers verify the
 * member's identity proof and authority; this port owns room and device effects.
 * Room assignments must come from a trusted source, never local selection.
 */
export interface MatrixProjectionPort {
  /** Provision a space (and, for bicameral, its chamber rooms) for a new
   *  community. Returns the room map to persist. Creates no user accounts. */
  createCommunitySpace(input: {
    communityUri: string
    name: string
    slug: string
    chamberMode: string
  }): Promise<{
    spaceId: string
    chamberA_RoomId: string | null
    chamberB_RoomId: string | null
    observerRoomId: string | null
  }>

  /**
   * Verified join (OD-6 / CD-M6). Derive the MXID from the identity public
   * key the member just proved possession of, ensure the Synapse account
   * exists, force-join it into the right rooms (main + chamber, or observer
   * layout) and set power levels from roles. `chamber` is the governance
   * decision; the room choice is here. Returns the MXID and joined rooms.
   */
  verifiedJoin(
    space: CommunitySpaceMap,
    did: string,
    identityPub: Uint8Array,
    opts: {
      roles: string[]
      chamber: 'A' | 'B' | null
      isObserver: boolean
    },
  ): Promise<{ mxid: string; joinedRoomIds: string[] }>

  /**
   * Record-driven role projection (the handover protocol). Applies current
   * roles as power levels — in every room of the community — to every chat
   * account this bridge has minted a device session for under that DID. This
   * is the only mechanism by which a role change (moderation rotation,
   * owner handover) reaches rooms the member
   * has already joined: the projection cannot name them from the DID, but it
   * can act on the accounts it provisioned sessions for. Idempotent; a DID
   * with no minted sessions (not yet joined) is a no-op.
   */
  applyMemberRoles(
    space: CommunitySpaceMap,
    did: string,
    opts: {
      roles: string[]
      chamber: 'A' | 'B' | null
      isObserver: boolean
    },
  ): Promise<void>

  /** Remove known chat accounts from this community without closing devices. */
  revokeMemberAccess(
    space: CommunitySpaceMap | null,
    did: string,
    reason: string,
  ): Promise<number>

  /**
   * Interaction-time access reconciliation. Runs at every verified
   * interaction (identity probe, session mint, attestation, join): for each
   * community the DID has state for, active memberships get their current
   * roles projected (catching downgrades that arrived while the member was
   * offline), and non-active memberships get the presented account banned
   * only in that community, including MAS-native accounts presented after
   * the removal. Global device sessions remain independent.
   *
   * This is what makes removal and role drift self-healing without ever
   * persisting the DID↔MXID pairing: the presented proof supplies the
   * account, governance state supplies the verdict, and neither outlives
   * the request.
   */
  reconcileMemberAccess(did: string, presentedMxid: string): Promise<void>
}

export function createMatrixProjection(
  config: Config,
  db: IBridgeDatabase,
  matrix: MatrixAdminClient,
  log: Logger,
  refreshAuthority?: (community: string, did: string) => Promise<void>,
): MatrixProjectionPort {
  // The homeserver's own server_name, not the host we reach it on. Those are
  // the same only in production; anywhere else this minted MXIDs Synapse
  // considers foreign and refused to act on.
  const serverName = config.matrixServerName

  const ensureUserExists = async (mxid: string): Promise<void> => {
    const exists = await matrix.userExists(mxid)
    if (!exists) {
      // MAS creates native accounts at first login; creating one here would
      // take the localpart MAS needs and strand the user.
      if (!config.matrixAllowAppServiceLogin) {
        throw new Error('MATRIX_CLIENT_LOGIN_REQUIRED')
      }
      await matrix.createUser(mxid)
      log.info({ mxid }, 'Created Matrix user from verified identity key')
    }
  }

  /**
   * Chat accounts attributable to a DID — the accounts this bridge minted a
   * device session for. This is operational session state, not a mapping
   * table: rows exist only where the member completed a verified interaction
   * with this bridge, they are revocable, and nothing exposes them as a
   * directory. It is what makes revocation and role projection possible
   * after CD-M1 removed the DID→MXID table.
   */
  const sessionMxidsForDid = async (did: string): Promise<string[]> => {
    const sessions = await db.listDeviceSessions(did)
    const active = sessions.filter((s) => s.revokedAt == null)
    return [...new Set(active.map((s) => s.mxid))]
  }

  // A space recorded while chat was off has no rooms until provisioned.
  const communityRoomIds = (space: CommunitySpaceMap): string[] =>
    !isProvisionedSpace(space)
      ? []
      : [
          space.spaceId,
          space.chamberA_RoomId,
          space.chamberB_RoomId,
          space.observerRoomId,
        ].filter((roomId): roomId is string => Boolean(roomId))

  const powerLevelForRoles = (roles: string[]): number => {
    if (roles.includes('owner')) return 100
    if (roles.includes('moderator')) return 50
    return 0
  }

  const isModerator = (roles: string[]): boolean =>
    roles.includes('owner') || roles.includes('moderator')

  type RoleOpts = {
    roles: string[]
    chamber: 'A' | 'B' | null
    isObserver: boolean
  }

  /**
   * The rooms a member is entitled to, with the power level to hold in each
   * (`undefined`: join, leave power levels as they are).
   *
   * Moderators and owners are entitled to every room of the community, both
   * chambers and the observer room included, at their moderator level. They
   * read reported messages in the room from their own client (D2, PARA
   * docs/MATRIX-COMMUNITY-CHAT-IMPLEMENTATION.md), and in an encrypted room a member cannot decrypt what
   * was sent before they joined: a moderator outside a chamber cannot review
   * it, and one who joins late cannot review its past. So they join all rooms
   * at their first verified join, and on promotion.
   */
  const entitledRooms = (
    space: CommunitySpaceMap,
    opts: RoleOpts,
  ): Array<{ roomId: string; powerLevel?: number }> => {
    const level = powerLevelForRoles(opts.roles)
    const rooms: Array<{ roomId: string; powerLevel?: number }> = [
      { roomId: space.spaceId, powerLevel: level },
    ]
    const chambers = [space.chamberA_RoomId, space.chamberB_RoomId].filter(
      (roomId): roomId is string => Boolean(roomId),
    )
    if (isModerator(opts.roles)) {
      for (const roomId of chambers) rooms.push({ roomId, powerLevel: level })
      if (space.observerRoomId) {
        rooms.push({ roomId: space.observerRoomId, powerLevel: level })
      }
      return rooms
    }
    if (opts.isObserver) {
      // Observers join both chambers read-only (PL = -1) and participate
      // fully in the observer room.
      for (const roomId of chambers) rooms.push({ roomId, powerLevel: -1 })
      if (space.observerRoomId) rooms.push({ roomId: space.observerRoomId })
      return rooms
    }
    if (space.chamberMode === 'bicameral' && opts.chamber) {
      const chamberRoomId =
        opts.chamber === 'A' ? space.chamberA_RoomId : space.chamberB_RoomId
      if (!chamberRoomId) {
        throw new Error(`Chamber ${opts.chamber} room not found for community`)
      }
      rooms.push({ roomId: chamberRoomId, powerLevel: level })
    }
    return rooms
  }

  /**
   * The sanction that restricts this member in this community, if any.
   * Moderators and owners cannot be sanctioned (the sanction route refuses),
   * so someone sanctioned earlier and given a role since is not held to it.
   */
  const sanctionFor = async (
    did: string,
    communityUri: string,
    roles: string[],
  ): Promise<EffectiveSanction | null> => {
    if (isModerator(roles)) return null
    return effectiveSanction(await db.getSanctionEvents(did, communityUri))
  }

  /**
   * Power levels are written from roles on every verified interaction, so a
   * mute has to be part of that computation: written once, it was undone the
   * next time the member's app talked to the bridge.
   */
  const withMute = <T extends { powerLevel?: number }>(
    rooms: T[],
    sanction: EffectiveSanction | null,
  ): T[] =>
    sanction?.type === 'mute'
      ? rooms.map((room) => ({ ...room, powerLevel: -1 }))
      : rooms

  /** Join one member into the right rooms with the right power levels. */
  const joinMemberRooms = async (
    space: CommunitySpaceMap,
    did: string,
    mxid: string,
    opts: RoleOpts,
  ): Promise<string[]> => {
    const sanction = await sanctionFor(did, space.communityUri, opts.roles)
    if (sanction?.type === 'ban') throw new SanctionedMemberError(sanction)
    const rooms = withMute(entitledRooms(space, opts), sanction)
    await ensureUserExists(mxid)
    const joined: string[] = []
    for (const { roomId, powerLevel } of rooms) {
      await matrix.unbanUser(roomId, mxid)
      joined.push(await matrix.joinUser(roomId, mxid))
      if (powerLevel !== undefined) {
        await matrix.setPowerLevel(roomId, mxid, powerLevel)
      }
    }
    if (space.chamberMode === 'bicameral' && opts.chamber) {
      log.info(
        { communityUri: space.communityUri, did, chamber: opts.chamber },
        'Verified join placed member in chamber',
      )
    }
    return joined
  }

  /**
   * Write the member's current roles onto specific accounts: join the rooms
   * they are now entitled to (a promotion to moderator reaches every room),
   * set their power levels, and remove them from rooms they no longer are (a
   * demotion or chamber change), so new room keys stop reaching them. What
   * they already decrypted stays on their devices.
   */
  const projectRolesToMxids = async (
    space: CommunitySpaceMap,
    did: string,
    mxids: string[],
    opts: RoleOpts,
  ): Promise<void> => {
    if (mxids.length === 0) return
    const sanction = await sanctionFor(did, space.communityUri, opts.roles)
    if (sanction?.type === 'ban') {
      // Not entitled to anything while banned. Re-assert the ban on every
      // account in case one was created after it was issued.
      for (const mxid of mxids) {
        for (const roomId of communityRoomIds(space)) {
          try {
            await matrix.banUser(roomId, mxid, 'Community moderation sanction')
          } catch {
            // Already banned, or the room is gone.
          }
        }
      }
      return
    }
    const rooms = withMute(entitledRooms(space, opts), sanction)
    const entitled = new Set(rooms.map((room) => room.roomId))
    const notEntitled = communityRoomIds(space).filter(
      (roomId) => !entitled.has(roomId),
    )
    for (const mxid of mxids) {
      for (const { roomId, powerLevel } of rooms) {
        // Force-join is idempotent for a member already in the room.
        if (roomId !== space.spaceId) await matrix.joinUser(roomId, mxid)
        if (powerLevel !== undefined) {
          await matrix.setPowerLevel(roomId, mxid, powerLevel)
        }
      }
      for (const roomId of notEntitled) {
        const members = await matrix.getRoomMembers(roomId)
        if (members.some((member) => member.user_id === mxid)) {
          await matrix.kickUser(roomId, mxid, 'Role no longer covers this room')
        }
      }
    }
  }

  const banAccounts = async (
    space: CommunitySpaceMap,
    accounts: string[],
    reason: string,
  ): Promise<void> => {
    const failures: unknown[] = []
    for (const mxid of accounts) {
      for (const roomId of communityRoomIds(space)) {
        try {
          await matrix.banUser(roomId, mxid, `Membership state: ${reason}`)
        } catch (err) {
          failures.push(err)
        }
      }
    }
    if (failures.length)
      throw new AggregateError(failures, 'Community access removal incomplete')
  }

  return {
    async createCommunitySpace({ name, slug, chamberMode, communityUri }) {
      const spaceId = await matrix.createSpace(name, slug, communityUri)
      if (chamberMode !== 'bicameral') {
        return {
          spaceId,
          chamberA_RoomId: null,
          chamberB_RoomId: null,
          observerRoomId: null,
        }
      }
      const [chamberA, chamberB, observerRoom] = await Promise.all([
        matrix.createRoom(
          `${name} — Cámara A`,
          `${slug}-chamber-a`,
          spaceId,
          communityUri,
        ),
        matrix.createRoom(
          `${name} — Cámara B`,
          `${slug}-chamber-b`,
          spaceId,
          communityUri,
        ),
        matrix.createRoom(
          `${name} — Consejo Observador`,
          `${slug}-observers`,
          spaceId,
          communityUri,
        ),
      ])
      await Promise.all([
        matrix.addChildSpace(spaceId, chamberA, [serverName]),
        matrix.addChildSpace(spaceId, chamberB, [serverName]),
        matrix.addChildSpace(spaceId, observerRoom, [serverName]),
      ])
      return {
        spaceId,
        chamberA_RoomId: chamberA,
        chamberB_RoomId: chamberB,
        observerRoomId: observerRoom,
      }
    },

    async verifiedJoin(space, did, identityPub, opts) {
      const mxid = mxidForIdentityPub(identityPub, serverName)
      const joinedRoomIds = await joinMemberRooms(space, did, mxid, opts)
      // The join is a verified interaction: it starts (or renews) the
      // account's membership lease for this community, so the lease sweep
      // will reach this account if it is ever removed and never heard from
      // again.
      await db.upsertCommunityMembershipLease(
        space.communityUri,
        mxid,
        new Date().toISOString(),
      )
      log.info(
        { communityUri: space.communityUri, did, mxid, joinedRoomIds },
        'Verified join completed',
      )
      return { mxid, joinedRoomIds }
    },

    async applyMemberRoles(space, did, opts) {
      if (!isProvisionedSpace(space)) return
      const mxids = await sessionMxidsForDid(did)
      if (mxids.length === 0) {
        // Never joined (or all sessions revoked): nothing to project onto.
        // The roles take effect at the next verified join.
        log.debug(
          { communityUri: space.communityUri, did },
          'Role change for member with no chat sessions; applied at next join',
        )
        return
      }
      await projectRolesToMxids(space, did, mxids, opts)
      log.info(
        { communityUri: space.communityUri, did, roles: opts.roles, mxids },
        'Projected role change to chat rooms',
      )
    },

    async revokeMemberAccess(space, did, reason) {
      if (!space || !isProvisionedSpace(space)) return 0
      const sessions = await db.listDeviceSessions(did)
      const accounts = [...new Set(sessions.map((session) => session.mxid))]
      await banAccounts(space, accounts, reason)
      return accounts.length
    },

    async reconcileMemberAccess(did, presentedMxid) {
      const memberships = await db.getMembershipsForDid(did)
      for (const cached of memberships) {
        await refreshAuthority?.(cached.communityUri, did)
        const membership = await db.getCommunityMembership(
          did,
          cached.communityUri,
        )
        if (!membership) continue
        const communityUri = cached.communityUri
        const space = await db.getSpaceForCommunity(communityUri)
        if (!space || !isProvisionedSpace(space)) continue
        if (membership.state === 'active') {
          // Catch-up for role changes that arrived while offline. The
          // presented account is included: it is entitled by membership,
          // even if this interaction is its first under this community.
          const roles = membership.roles ?? []

          const chamber = null
          const opts = {
            roles,
            chamber,
            isObserver: false,
          }
          const entitled = [
            ...new Set([...(await sessionMxidsForDid(did)), presentedMxid]),
          ]
          await projectRolesToMxids(space, did, entitled, opts)
          // This interaction renews the lease of every account the member
          // actively holds for this community.
          const nowIso = new Date().toISOString()
          for (const mxid of entitled) {
            await db.upsertCommunityMembershipLease(communityUri, mxid, nowIso)
          }
        } else {
          // Removal that arrived while offline. The presented account is
          // banned from the rooms even when the bridge never minted a
          // session for it (MAS-native logins); minted sessions are
          // banned as at event time.
          const sessions = await db.listDeviceSessions(did)
          try {
            await banAccounts(
              space,
              [
                ...new Set([
                  presentedMxid,
                  ...sessions.map((session) => session.mxid),
                ]),
              ],
              membership.state,
            )
          } catch (err) {
            await db.logSync(
              'revoke',
              communityUri,
              did,
              space.spaceId,
              false,
              'Community access removal pending',
            )
            throw err
          }
        }
      }
    },
  }
}

/**
 * The projection when chat is off (`MATRIX_CHAT_ENABLED=false`). Verified
 * authority still refreshes, without homeserver effects. New communities keep
 * an unprovisioned space-map row with their room configuration, and
 * the firehose queues it for provisioning once chat is on.
 */
export function createChatDisabledProjection(): MatrixProjectionPort {
  return {
    async createCommunitySpace({ communityUri }) {
      return {
        spaceId: unprovisionedSpaceId(communityUri),
        chamberA_RoomId: null,
        chamberB_RoomId: null,
        observerRoomId: null,
      }
    },
    async verifiedJoin() {
      throw new ChatDisabledError()
    },
    async applyMemberRoles() {},
    async revokeMemberAccess() {
      return 0
    },
    async reconcileMemberAccess() {},
  }
}
