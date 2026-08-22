import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
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


  // User <-> MXID mappings
  getMxidForDid(did: string): string | undefined {
    const row = this.db
      .prepare('SELECT matrix_user_id FROM user_matrix_map WHERE did = ?')
      .get(did) as { matrix_user_id: string } | undefined
    return row?.matrix_user_id
  }


  setMxidForDid(did: string, mxid: string, password: string): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO user_matrix_map (did, matrix_user_id, password) VALUES (?, ?, ?)',
      )
      .run(did, mxid, password)
  }


  getUserPassword(did: string): string | undefined {
    const row = this.db
      .prepare('SELECT password FROM user_matrix_map WHERE did = ?')
      .get(did) as { password: string } | undefined
    return row?.password
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


  // Get DID by MXID
  getDidForMxid(mxid: string): string | undefined {
    const row = this.db
      .prepare('SELECT did FROM user_matrix_map WHERE matrix_user_id = ?')
      .get(mxid) as { did: string } | undefined
    return row?.did
  }
}
