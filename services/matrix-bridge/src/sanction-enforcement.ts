import type { Logger } from 'pino'
import type { SanctionKind } from './chat-moderation.js'
import type { IBridgeDatabase } from './db/index.js'
import type { CommunitySpaceMap } from './db/interface.js'
import type { MatrixProjectionPort } from './matrix-projection.js'
import type { MatrixAdminClient } from './matrix.js'

/**
 * What happened when a sanction was applied or lifted in Matrix.
 *
 * - `applied`: every account and room was updated.
 * - `partial` / `failed`: some or all updates were refused. The sanction is
 *   still recorded, and the projection re-applies it the next time the member
 *   interacts with the bridge, so it is not lost; but a moderator should know.
 * - `pending`: the bridge has no chat account for this member yet (or no
 *   rooms for the community). Nothing to change now; the projection enforces
 *   the sanction when they first join.
 */
export interface EnforcementResult {
  status: 'applied' | 'partial' | 'failed' | 'pending'
  accounts: number
  applied: number
  failed: number
}

export interface SanctionEnforcer {
  apply(
    did: string,
    communityUri: string,
    kind: SanctionKind,
  ): Promise<EnforcementResult>
  lift(
    did: string,
    communityUri: string,
    kind: SanctionKind,
  ): Promise<EnforcementResult>
}

function communityRoomIds(space: CommunitySpaceMap): string[] {
  return [
    space.spaceId,
    space.chamberA_RoomId,
    space.chamberB_RoomId,
    space.observerRoomId,
  ].filter((roomId): roomId is string => Boolean(roomId))
}

function result(
  accounts: number,
  applied: number,
  failed: number,
): EnforcementResult {
  const status =
    accounts === 0
      ? 'pending'
      : failed === 0
        ? 'applied'
        : applied === 0
          ? 'failed'
          : 'partial'
  return { status, accounts, applied, failed }
}

/**
 * Applies and lifts moderator sanctions on the chat accounts the bridge
 * minted for a DID (operational session state, see matrix-projection.ts).
 *
 * Every account ever minted is included, revoked sessions too: the account is
 * the same one the member would use again, so it must carry the ban, and it
 * must be freed when the ban is lifted.
 */
export function createSanctionEnforcer(deps: {
  db: IBridgeDatabase
  matrix: MatrixAdminClient
  projection: MatrixProjectionPort
  log: Logger
}): SanctionEnforcer {
  const { db, matrix, projection, log } = deps

  const accountsAndSpace = async (did: string, communityUri: string) => {
    const sessions = await db.listDeviceSessions(did)
    const mxids = [...new Set(sessions.map((s) => s.mxid))]
    const space = await db.getSpaceForCommunity(communityUri)
    return { mxids, space }
  }

  return {
    async apply(did, communityUri, kind) {
      const { mxids, space } = await accountsAndSpace(did, communityUri)
      if (mxids.length === 0 || !space) return result(0, 0, 0)
      let applied = 0
      let failed = 0
      for (const mxid of mxids) {
        for (const roomId of communityRoomIds(space)) {
          try {
            if (kind === 'ban') await matrix.banUser(roomId, mxid)
            else await matrix.muteUser(roomId, mxid)
            applied++
          } catch (err) {
            failed++
            log.warn(
              { err, roomId, mxid, kind },
              'Failed to apply moderation sanction in Matrix room',
            )
          }
        }
      }
      return result(mxids.length, applied, failed)
    },

    async lift(did, communityUri, kind) {
      const { mxids, space } = await accountsAndSpace(did, communityUri)
      if (mxids.length === 0 || !space) return result(0, 0, 0)
      let applied = 0
      let failed = 0
      if (kind === 'ban') {
        for (const mxid of mxids) {
          for (const roomId of communityRoomIds(space)) {
            try {
              await matrix.unbanUser(roomId, mxid)
              applied++
            } catch (err) {
              failed++
              log.warn(
                { err, roomId, mxid },
                'Failed to lift ban in Matrix room',
              )
            }
          }
        }
      }
      // Both kinds: put each account back where the member's roles place it.
      // Restoring a flat power level here would be wrong for observers, who
      // are read-only in the chambers by design, so re-project the roles.
      // The sanction is already out of force when this runs, so the
      // projection no longer overrides them.
      const membership = await db.getCommunityMembership(did, communityUri)
      if (membership?.state === 'active') {
        const roles = membership.roles ?? []
        const assigned = await db.getChamberAssignment(communityUri, did)
        try {
          // Not counted as `applied`: a restored role does not make up for a
          // ban that is still in force. It can only add a failure.
          await projection.applyMemberRoles(space, did, {
            roles,
            chamber: assigned === 'A' || assigned === 'B' ? assigned : null,
            isObserver: roles.includes('observer'),
          })
        } catch (err) {
          failed++
          log.warn({ err, did, communityUri }, 'Failed to restore roles')
        }
      }
      return result(mxids.length, applied, failed)
    },
  }
}
