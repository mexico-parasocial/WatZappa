import { randomUUID } from 'node:crypto'
import type { Logger } from 'pino'

import type { CommunitySpaceMap } from './db/interface.js'
import type { IBridgeDatabase } from './db/index.js'
import type { Config } from './config.js'
import type { MatrixAdminClient } from './matrix.js'
import { didToMxid, extractServerName } from './matrix.js'

/**
 * Matrix projection port (CD-M2). The governance side (firehose) decides
 * WHAT should happen — who belongs, which chamber a member sits in, who owns
 * a community — and expresses it through this interface in terms of DIDs.
 * The implementation owns everything MXID: deriving identities, provisioning
 * Synapse users, inviting, kicking and setting power levels. Governance code
 * never resolves, stores or derives an MXID itself.
 *
 * The one-way rule from MATRIX_V2 §7: governance → projection calls only.
 * Nothing here calls back into governance state.
 */
export interface MatrixProjectionPort {
  /** Provision a space (and, for bicameral, its chamber rooms) for a new
   *  community. Returns the room map to persist. */
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

  /** Ensure the creator exists as a Matrix user and owns their space. */
  installOwner(spaceId: string, did: string): Promise<void>

  /**
   * Project an active membership: create the Matrix user if needed, invite to
   * the right rooms (main + chamber, or observer layout) and set power levels
   * from roles. `chamber` is the governance decision; the room choice is here.
   */
  inviteMember(
    space: CommunitySpaceMap,
    did: string,
    opts: {
      roles: string[]
      chamber: 'A' | 'B' | null
      isObserver: boolean
    },
  ): Promise<{ chamberRoomId: string | null }>

  /** Remove a member from every room of the community. */
  kickMember(space: CommunitySpaceMap, did: string, reason: string): Promise<void>
}

export function createMatrixProjection(
  config: Config,
  db: IBridgeDatabase,
  matrix: MatrixAdminClient,
  log: Logger,
): MatrixProjectionPort {
  const serverName = extractServerName(config.matrixHomeserverUrl)

  const ensureMxid = async (did: string): Promise<string> => {
    let mxid = await db.getMxidForDid(did)
    if (!mxid) {
      mxid = didToMxid(did, serverName)
      await db.setMxidForDid(did, mxid, '')
    }
    return mxid
  }

  const ensureUserExists = async (mxid: string, did: string): Promise<void> => {
    const exists = await matrix.userExists(mxid)
    if (!exists) {
      const password = randomUUID()
      await matrix.createUser(mxid, did, password)
      await db.setMxidForDid(did, mxid, password)
      log.info({ did, mxid }, 'Created Matrix user')
    }
  }

  const inviteIfAbsent = async (roomId: string, userMxid: string) => {
    const members = await matrix.getRoomMembers(roomId)
    if (!members.some((m) => m.user_id === userMxid)) {
      await matrix.inviteUser(roomId, userMxid)
      return true
    }
    return false
  }

  const powerLevelForRoles = (roles: string[]): number => {
    if (roles.includes('owner')) return 100
    if (roles.includes('moderator')) return 50
    return 0
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

    async installOwner(spaceId, did) {
      const creatorMxid = await ensureMxid(did)
      await ensureUserExists(creatorMxid, did)
      await matrix.inviteUser(spaceId, creatorMxid)
      await matrix.setPowerLevel(spaceId, creatorMxid, 100)
    },

    async inviteMember(space, did, { roles, chamber, isObserver }) {
      const userMxid = await ensureMxid(did)
      await ensureUserExists(userMxid, did)

      // Everyone gets the main space (announcements + votes).
      const mainMembers = await matrix.getRoomMembers(space.spaceId)
      if (!mainMembers.some((m) => m.user_id === userMxid)) {
        await matrix.inviteUser(space.spaceId, userMxid)
      }

      let chamberRoomId: string | null = null

      if (isObserver) {
        // Observers join both chambers read-only (PL = -1) and participate
        // fully in the observer room.
        for (const roomId of [space.chamberA_RoomId, space.chamberB_RoomId]) {
          if (!roomId) continue
          await inviteIfAbsent(roomId, userMxid)
          await matrix.setPowerLevel(roomId, userMxid, -1)
        }
        if (space.observerRoomId) {
          await inviteIfAbsent(space.observerRoomId, userMxid)
          log.info(
            { communityUri: space.communityUri, userMxid },
            'Invited observer to observer room',
          )
        }
        await matrix.setPowerLevel(space.spaceId, userMxid, powerLevelForRoles(roles))
        return { chamberRoomId: null }
      }

      if (space.chamberMode === 'bicameral' && chamber) {
        chamberRoomId =
          chamber === 'A' ? space.chamberA_RoomId : space.chamberB_RoomId
        if (!chamberRoomId) {
          throw new Error(`Chamber ${chamber} room not found for community`)
        }
        const invited = await inviteIfAbsent(chamberRoomId, userMxid)
        if (invited) {
          log.info(
            {
              communityUri: space.communityUri,
              did,
              chamber,
              roomId: chamberRoomId,
            },
            'Invited user to chamber',
          )
        }
        await matrix.setPowerLevel(chamberRoomId, userMxid, powerLevelForRoles(roles))
      }

      await matrix.setPowerLevel(space.spaceId, userMxid, powerLevelForRoles(roles))
      return { chamberRoomId }
    },

    async kickMember(space, did, reason) {
      const userMxid = await ensureMxid(did)
      const rooms = [
        space.spaceId,
        space.chamberA_RoomId,
        space.chamberB_RoomId,
        space.observerRoomId,
      ].filter((roomId): roomId is string => Boolean(roomId))
      for (const roomId of rooms) {
        try {
          await matrix.kickUser(roomId, userMxid, `Membership state: ${reason}`)
        } catch {
          // User might not be in this room, ignore
        }
      }
      log.info({ userMxid, state: reason }, 'Removed user from all community rooms')
    },
  }
}
