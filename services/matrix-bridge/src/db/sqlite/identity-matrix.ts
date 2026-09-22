import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord,
  CommunityRoomKind,
  CommunityRoomSummary,
  CommunitySpaceMap,
  DeviceSession,
  SyncLogEntry,
  UserPushToken,
} from '../interface.js'
import { SqliteBase } from './base.js'

export class IdentityMatrixArea extends SqliteBase {
  protected mapCommunitySpace(row: any): CommunitySpaceMap {
    return {
      communityUri: row.community_uri,
      spaceId: row.space_id,
      slug: row.slug,
      chamberMode: row.chamber_mode,
      chamberA_RoomId: row.chamber_a_room_id ?? null,
      chamberB_RoomId: row.chamber_b_room_id ?? null,
      observerRoomId: row.observer_room_id ?? null,
      createdAt: row.created_at,
    }
  }

  // Community <-> Space mappings
  getSpaceForCommunity(communityUri: string): CommunitySpaceMap | undefined {
    const row = this.db
      .prepare('SELECT * FROM community_space_map WHERE community_uri = ?')
      .get(communityUri) as any | undefined
    return row ? this.mapCommunitySpace(row) : undefined
  }

  setSpaceForCommunity(
    communityUri: string,
    spaceId: string,
    slug: string,
    chamberMode = 'unicameral',
  ): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO community_space_map (community_uri, space_id, slug, chamber_mode, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
      )
      .run(communityUri, spaceId, slug, chamberMode)
  }

  setChamberRooms(
    communityUri: string,
    chamberA: string | null,
    chamberB: string | null,
    observerRoom: string | null,
  ): void {
    this.db
      .prepare(
        'UPDATE community_space_map SET chamber_a_room_id = ?, chamber_b_room_id = ?, observer_room_id = ? WHERE community_uri = ?',
      )
      .run(chamberA, chamberB, observerRoom, communityUri)
  }

  // Chamber assignments
  getChamberAssignment(communityUri: string, did: string): string | undefined {
    const row = this.db
      .prepare(
        'SELECT chamber FROM chamber_assignment WHERE community_uri = ? AND did = ?',
      )
      .get(communityUri, did) as { chamber: string } | undefined
    return row?.chamber
  }

  setChamberAssignment(
    communityUri: string,
    did: string,
    chamber: string,
  ): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO chamber_assignment (community_uri, did, chamber) VALUES (?, ?, ?)',
      )
      .run(communityUri, did, chamber)
  }

  getChamberMemberCount(communityUri: string, chamber: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM chamber_assignment WHERE community_uri = ? AND chamber = ?',
      )
      .get(communityUri, chamber) as { count: number }
    return row.count
  }

  getActiveMemberCount(communityUri: string): number {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM community_membership_state WHERE community_uri = ? AND membership_state = 'active'",
      )
      .get(communityUri) as { count: number }
    return row.count
  }

  // Chat-account attribution (post-CD-M1)
  //
  // There is no DID↔MXID mapping table and no way to mint one: the MXID is a
  // hash of client-held key material (identity-proof.ts). The only reverse
  // resolution available is over the device sessions this bridge itself
  // minted after a verified proof of possession — operational state, not a
  // directory. It backs chat-message attribution in matrix-ingestion.ts and
  // is deliberately absent from any API response.
  getDidForMxid(mxid: string): string | undefined {
    const row = this.db
      .prepare(
        'SELECT did FROM device_sessions WHERE mxid = ? AND revoked_at IS NULL LIMIT 1',
      )
      .get(mxid) as { did: string } | undefined
    return row?.did
  }

  setCommunityMembership(
    did: string,
    communityUri: string,
    membershipState: string,
    roles: string[] = [],
  ): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO community_membership_state
          (did, community_uri, membership_state, roles_json, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      )
      .run(did, communityUri, membershipState, JSON.stringify(roles))
  }

  getCommunityMembership(
    did: string,
    communityUri: string,
  ): { state: string; roles: string[] } | undefined {
    const row = this.db
      .prepare(
        'SELECT membership_state, roles_json FROM community_membership_state WHERE did = ? AND community_uri = ?',
      )
      .get(did, communityUri) as any | undefined
    if (!row) return undefined
    let roles: string[] = []
    try {
      roles = JSON.parse(row.roles_json ?? '[]')
    } catch {
      roles = []
    }
    return { state: row.membership_state, roles }
  }

  getMembershipsForDid(
    did: string,
  ): Array<{ communityUri: string; state: string; roles: string[] }> {
    const rows = this.db
      .prepare(
        'SELECT community_uri, membership_state, roles_json FROM community_membership_state WHERE did = ?',
      )
      .all(did) as Array<{
      community_uri: string
      membership_state: string
      roles_json: string
    }>
    return rows.map((r) => ({
      communityUri: r.community_uri,
      state: r.membership_state,
      roles: JSON.parse(r.roles_json ?? '[]'),
    }))
  }

  upsertCommunityMembershipLease(
    communityUri: string,
    mxid: string,
    verifiedAtIso: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO community_membership_lease (community_uri, mxid, last_verified_at)
         VALUES (?, ?, ?)
         ON CONFLICT (community_uri, mxid) DO UPDATE SET last_verified_at = EXCLUDED.last_verified_at`,
      )
      .run(communityUri, mxid, verifiedAtIso)
  }

  getExpiredCommunityMembershipLeases(cutoffIso: string): Array<{
    communityUri: string
    mxid: string
    lastVerifiedAt: string
  }> {
    const rows = this.db
      .prepare(
        'SELECT community_uri, mxid, last_verified_at FROM community_membership_lease WHERE last_verified_at < ?',
      )
      .all(cutoffIso) as Array<{
      community_uri: string
      mxid: string
      last_verified_at: string
    }>
    return rows.map((r) => ({
      communityUri: r.community_uri,
      mxid: r.mxid,
      lastVerifiedAt: r.last_verified_at,
    }))
  }

  deleteCommunityMembershipLease(communityUri: string, mxid: string): void {
    this.db
      .prepare(
        'DELETE FROM community_membership_lease WHERE community_uri = ? AND mxid = ?',
      )
      .run(communityUri, mxid)
  }

  isActiveCommunityMember(did: string, communityUri: string): boolean {
    const row = this.db
      .prepare(
        'SELECT membership_state FROM community_membership_state WHERE did = ? AND community_uri = ?',
      )
      .get(did, communityUri) as { membership_state: string } | undefined
    return row?.membership_state === 'active'
  }

  getActiveCommunityRoomsForDid(did: string): CommunityRoomSummary[] {
    const rows = this.db
      .prepare(
        `SELECT
          csm.space_id,
          csm.community_uri,
          csm.slug,
          csm.chamber_mode,
          csm.chamber_a_room_id,
          csm.chamber_b_room_id,
          csm.observer_room_id,
          cms.roles_json,
          ca.chamber
         FROM community_space_map csm
         INNER JOIN community_membership_state cms
           ON cms.community_uri = csm.community_uri
         LEFT JOIN chamber_assignment ca
           ON ca.community_uri = csm.community_uri AND ca.did = cms.did
         WHERE cms.did = ? AND cms.membership_state = 'active'`,
      )
      .all(did) as Array<{
      space_id: string
      community_uri: string
      slug: string
      chamber_mode: string
      chamber_a_room_id: string | null
      chamber_b_room_id: string | null
      observer_room_id: string | null
      roles_json: string
      chamber: string | null
    }>

    return rows.flatMap((row) => {
      const rooms: CommunityRoomSummary[] = [
        {
          roomId: row.space_id,
          communityUri: row.community_uri,
          slug: row.slug,
          kind: 'main',
        },
      ]

      if (row.chamber_mode !== 'bicameral') {
        return rooms
      }

      const roles = JSON.parse(row.roles_json || '[]') as string[]
      const isObserver = roles.includes('observer')
      if (isObserver && row.observer_room_id) {
        rooms.push({
          roomId: row.observer_room_id,
          communityUri: row.community_uri,
          slug: row.slug,
          kind: 'observers',
        })
        return rooms
      }

      if (row.chamber === 'A' && row.chamber_a_room_id) {
        rooms.push({
          roomId: row.chamber_a_room_id,
          communityUri: row.community_uri,
          slug: row.slug,
          kind: 'chamber-a',
        })
      } else if (row.chamber === 'B' && row.chamber_b_room_id) {
        rooms.push({
          roomId: row.chamber_b_room_id,
          communityUri: row.community_uri,
          slug: row.slug,
          kind: 'chamber-b',
        })
      }

      return rooms
    })
  }

  // Lookup community by any of its room IDs
  getCommunityByRoomId(
    roomId: string,
  ): { communityUri: string; slug: string } | undefined {
    const row = this.db
      .prepare(
        `SELECT community_uri, slug FROM community_space_map WHERE space_id = ? OR chamber_a_room_id = ? OR chamber_b_room_id = ? OR observer_room_id = ?`,
      )
      .get(roomId, roomId, roomId, roomId) as
      { community_uri: string; slug: string } | undefined
    return row ? { communityUri: row.community_uri, slug: row.slug } : undefined
  }

  // Device sessions (trusted-device registry, patterned on tranquil-pds)

  private mapDeviceSession(row: any): DeviceSession {
    return {
      id: row.id,
      did: row.did,
      mxid: row.mxid,
      deviceId: row.device_id,
      friendlyName: row.friendly_name ?? null,
      userAgent: row.user_agent ?? null,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      revokedAt: row.revoked_at ?? null,
    }
  }

  createDeviceSession(session: DeviceSession): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO device_sessions
          (id, did, mxid, device_id, friendly_name, user_agent, created_at, last_seen_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        session.id,
        session.did,
        session.mxid,
        session.deviceId,
        session.friendlyName,
        session.userAgent,
        session.createdAt,
        session.lastSeenAt,
      )
    return Promise.resolve()
  }

  listDeviceSessions(did: string): Promise<DeviceSession[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM device_sessions WHERE did = ? ORDER BY created_at DESC',
      )
      .all(did) as any[]
    return Promise.resolve(rows.map((r) => this.mapDeviceSession(r)))
  }

  getDeviceSession(id: string): Promise<DeviceSession | undefined> {
    const row = this.db
      .prepare('SELECT * FROM device_sessions WHERE id = ?')
      .get(id) as any | undefined
    return Promise.resolve(row ? this.mapDeviceSession(row) : undefined)
  }

  touchDeviceSession(id: string): Promise<void> {
    this.db
      .prepare(
        "UPDATE device_sessions SET last_seen_at = datetime('now') WHERE id = ?",
      )
      .run(id)
    return Promise.resolve()
  }

  revokeDeviceSession(did: string, id: string): Promise<boolean> {
    const res = this.db
      .prepare(
        "UPDATE device_sessions SET revoked_at = datetime('now') WHERE id = ? AND did = ? AND revoked_at IS NULL",
      )
      .run(id, did)
    return Promise.resolve(res.changes > 0)
  }
}
