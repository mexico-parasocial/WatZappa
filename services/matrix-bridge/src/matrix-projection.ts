import type { Logger } from 'pino'
import type { Config } from './config.js'
import type { IBridgeDatabase } from './db/index.js'
import type { CommunitySpaceMap } from './db/interface.js'
import { mxidForIdentityPub } from './identity-proof.js'
import type { MatrixAdminClient } from './matrix.js'

/**
 * Matrix projection port (CD-M2). The governance side (firehose) decides
 * WHAT should happen — who belongs, which chamber a member sits in, who owns
 * a community — and expresses it through this interface in terms of DIDs and,
 * for the verified join, the identity public key the member presented. The
 * implementation owns everything MXID: deriving localparts from presented
 * keys, provisioning Synapse users, joining rooms and setting power levels.
 * Governance code never resolves, stores or derives an MXID itself.
 *
 * The one-way rule from MATRIX_V2 §7: governance → projection calls only.
 * Nothing here calls back into governance state.
 *
 * Post-CD-M1 (F7): the projection cannot name a user from a DID — the MXID
 * is a hash of client-held key material, and no table relates the two. Every
 * operation that used to push a DID into a room is gone. Membership is
 * pull-based (CD-M6): the member presents a CD-M4 proof of possession, the
 * route verifies it alongside M8 session + active community membership, and
 * calls verifiedJoin with the presented key.
 */
export interface MatrixProjectionPort {
  /** Provision a space (and, for bicameral, its chamber rooms) for a new
   *  community. Returns the room map to persist. Creates no user accounts. */
  createCommunitySpace(input: {
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
   * sortition replacing a delegate, owner handover) reaches rooms the member
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

  /**
   * Revocation. The bridge cannot kick a DID it cannot name, so removal is
   * enforced on what it does hold: every device session it minted for the
   * DID is deactivated on the homeserver (killing that account's access
   * tokens) and banned from the community's rooms. Re-entry is already
   * impossible — the next verified join would fail the active-membership
   * check. Returns the number of sessions revoked.
   */
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
   * and any minted sessions revoked (catching removals that arrived while
   * the member was offline — including MAS-native accounts the bridge never
   * minted a session for, which revocation-at-event-time cannot reach).
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
): MatrixProjectionPort {
  // The homeserver's own server_name, not the host we reach it on. Those are
  // the same only in production; anywhere else this minted MXIDs Synapse
  // considers foreign and refused to act on.
  const serverName = config.matrixServerName

  const ensureUserExists = async (mxid: string): Promise<void> => {
    const exists = await matrix.userExists(mxid)
    if (!exists) {
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

  const communityRoomIds = (space: CommunitySpaceMap): string[] =>
    [
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
   * docs/MATRIX-D2-*), and in an encrypted room a member cannot decrypt what
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

  /** Join one member into the right rooms with the right power levels. */
  const joinMemberRooms = async (
    space: CommunitySpaceMap,
    did: string,
    mxid: string,
    opts: RoleOpts,
  ): Promise<string[]> => {
    const rooms = entitledRooms(space, opts)
    await ensureUserExists(mxid)
    const joined: string[] = []
    for (const { roomId, powerLevel } of rooms) {
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
    mxids: string[],
    opts: RoleOpts,
  ): Promise<void> => {
    if (mxids.length === 0) return
    const rooms = entitledRooms(space, opts)
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

  return {
    async createCommunitySpace({ name, slug, chamberMode }) {
      const spaceId = await matrix.createSpace(name, slug)
      if (chamberMode !== 'bicameral') {
        return {
          spaceId,
          chamberA_RoomId: null,
          chamberB_RoomId: null,
          observerRoomId: null,
        }
      }
      const [chamberA, chamberB, observerRoom] = await Promise.all([
        matrix.createRoom(`${name} — Cámara A`, `${slug}-chamber-a`, spaceId),
        matrix.createRoom(`${name} — Cámara B`, `${slug}-chamber-b`, spaceId),
        matrix.createRoom(
          `${name} — Consejo Observador`,
          `${slug}-observers`,
          spaceId,
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
      await projectRolesToMxids(space, mxids, opts)
      log.info(
        { communityUri: space.communityUri, did, roles: opts.roles, mxids },
        'Projected role change to chat rooms',
      )
    },

    async revokeMemberAccess(space, did, reason) {
      const sessions = await db.listDeviceSessions(did)
      if (sessions.length === 0) return 0
      const rooms = space ? communityRoomIds(space) : []
      for (const session of sessions) {
        if (!session.revokedAt) {
          try {
            await matrix.adminDeactivateDevice(session.mxid, session.deviceId)
          } catch (err) {
            // Device may already be gone on the homeserver; the local revocation
            // below is still the source of truth for "this session is dead".
            log.warn(
              { err, mxid: session.mxid, deviceId: session.deviceId },
              'Homeserver device deactivation failed during revocation',
            )
          }
        }
        for (const roomId of rooms) {
          try {
            await matrix.banUser(
              roomId,
              session.mxid,
              `Membership state: ${reason}`,
            )
          } catch {
            // Not in this room, or already banned.
          }
        }
        if (!session.revokedAt) {
          await db.revokeDeviceSession(did, session.id)
        }
      }
      log.info(
        { did, state: reason, sessions: sessions.length },
        'Revoked Matrix access for all minted sessions',
      )
      return sessions.length
    },

    async reconcileMemberAccess(did, presentedMxid) {
      const memberships = await db.getMembershipsForDid(did)
      for (const membership of memberships) {
        const space = await db.getSpaceForCommunity(membership.communityUri)
        if (!space) continue
        if (membership.state === 'active') {
          // Catch-up for role changes that arrived while offline. The
          // presented account is included: it is entitled by membership,
          // even if this interaction is its first under this community.
          const roles = membership.roles ?? []
          const assigned = await db.getChamberAssignment(
            membership.communityUri,
            did,
          )
          const chamber: 'A' | 'B' | null =
            assigned === 'A' || assigned === 'B' ? assigned : null
          const opts = {
            roles,
            chamber,
            isObserver: roles.includes('observer'),
          }
          const entitled = [
            ...new Set([...(await sessionMxidsForDid(did)), presentedMxid]),
          ]
          await projectRolesToMxids(space, entitled, opts)
          // This interaction renews the lease of every account the member
          // actively holds for this community.
          const nowIso = new Date().toISOString()
          for (const mxid of entitled) {
            await db.upsertCommunityMembershipLease(
              membership.communityUri,
              mxid,
              nowIso,
            )
          }
        } else {
          // Removal that arrived while offline. The presented account is
          // banned from the rooms even when the bridge never minted a
          // session for it (MAS-native logins); minted sessions are
          // deactivated and banned as at event time.
          for (const roomId of communityRoomIds(space)) {
            try {
              await matrix.banUser(
                roomId,
                presentedMxid,
                `Membership state: ${membership.state}`,
              )
            } catch {
              // Not in this room, or already banned.
            }
          }
          await this.revokeMemberAccess(space, did, membership.state)
        }
      }
    },
  }
}
