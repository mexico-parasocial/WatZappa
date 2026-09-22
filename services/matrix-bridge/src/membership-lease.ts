import type { Logger } from 'pino'
import type { IBridgeDatabase } from './db/index.js'
import type { MatrixAdminClient } from './matrix.js'

/**
 * Membership-lease sweep (CD-M6).
 *
 * The residual the interaction-time reconciliation cannot close: a removed
 * member who never interacts again keeps a live Matrix sync, because the
 * bridge cannot name their account at revocation time and reconciliation
 * only runs when they show up. Naming them would require persisting the
 * DID↔MXID pairing — the artefact the whole design removes.
 *
 * The lease closes it without naming anyone. Every verified interaction
 * (join, reconciliation, attestation) records when each chat account last
 * proved currency for a community — keyed by community + MXID, deliberately
 * without a DID. This sweep evicts accounts whose lease has expired: kicked
 * from the community's rooms, lease row deleted.
 *
 * Eviction is a kick, not a ban: lease expiry also reaches active members
 * who simply did not open the app within the TTL, and their next verified
 * join re-admits them immediately (the join is idempotent and their
 * membership is still active). Bans remain reserved for explicit removal,
 * which the reconciliation path applies.
 *
 * `ttlMs <= 0` disables the sweep (no expiry).
 */
export async function sweepExpiredMembershipLeases(
  db: IBridgeDatabase,
  matrix: MatrixAdminClient,
  log: Logger,
  ttlMs: number,
): Promise<number> {
  if (ttlMs <= 0) return 0
  const cutoff = new Date(Date.now() - ttlMs).toISOString()
  const expired = await db.getExpiredCommunityMembershipLeases(cutoff)
  if (expired.length === 0) return 0

  let evicted = 0
  for (const lease of expired) {
    const space = await db.getSpaceForCommunity(lease.communityUri)
    if (space) {
      const rooms = [
        space.spaceId,
        space.chamberA_RoomId,
        space.chamberB_RoomId,
        space.observerRoomId,
      ].filter((roomId): roomId is string => Boolean(roomId))
      for (const roomId of rooms) {
        try {
          await matrix.kickUser(roomId, lease.mxid, 'Membership lease expired')
        } catch {
          // Not in this room (or already gone): the desired end state.
        }
      }
    }
    await db.deleteCommunityMembershipLease(lease.communityUri, lease.mxid)
    evicted++
    log.info(
      {
        communityUri: lease.communityUri,
        mxid: lease.mxid,
        lastVerifiedAt: lease.lastVerifiedAt,
      },
      'Evicted expired membership lease',
    )
  }
  return evicted
}
