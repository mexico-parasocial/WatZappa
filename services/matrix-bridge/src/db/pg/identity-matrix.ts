import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { PgBase } from './base.js'

export class IdentityMatrixArea extends PgBase {


  // Community <-> Space mappings
  async getSpaceForCommunity(
    communityUri: string,
  ): Promise<CommunitySpaceMap | undefined> {
    return this.queryOne<CommunitySpaceMap>(
      'SELECT * FROM community_space_map WHERE community_uri = $1',
      [communityUri],
    )
  }


  async setSpaceForCommunity(
    communityUri: string,
    spaceId: string,
    slug: string,
    chamberMode = 'unicameral',
  ): Promise<void> {
    await this.run(
      `INSERT INTO community_space_map (community_uri, space_id, slug, chamber_mode, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (community_uri) DO UPDATE SET
         space_id = EXCLUDED.space_id,
         slug = EXCLUDED.slug,
         chamber_mode = EXCLUDED.chamber_mode,
         created_at = EXCLUDED.created_at`,
      [communityUri, spaceId, slug, chamberMode],
    )
  }


  async setChamberRooms(
    communityUri: string,
    chamberA: string | null,
    chamberB: string | null,
    observerRoom: string | null,
  ): Promise<void> {
    await this.run(
      'UPDATE community_space_map SET chamber_a_room_id = $1, chamber_b_room_id = $2, observer_room_id = $3 WHERE community_uri = $4',
      [chamberA, chamberB, observerRoom, communityUri],
    )
  }


  // Chamber assignments
  async getChamberAssignment(
    communityUri: string,
    did: string,
  ): Promise<string | undefined> {
    const row = await this.queryOne<{ chamber: string }>(
      'SELECT chamber FROM chamber_assignment WHERE community_uri = $1 AND did = $2',
      [communityUri, did],
    )
    return row?.chamber
  }


  async setChamberAssignment(
    communityUri: string,
    did: string,
    chamber: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO chamber_assignment (community_uri, did, chamber) VALUES ($1, $2, $3)
       ON CONFLICT (community_uri, did) DO UPDATE SET chamber = EXCLUDED.chamber`,
      [communityUri, did, chamber],
    )
  }


  async getChamberMemberCount(
    communityUri: string,
    chamber: string,
  ): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM chamber_assignment WHERE community_uri = $1 AND chamber = $2',
      [communityUri, chamber],
    )
    return row?.count ?? 0
  }


  async getActiveMemberCount(communityUri: string): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM community_membership_state WHERE community_uri = $1 AND membership_state = 'active'",
      [communityUri],
    )
    return row?.count ?? 0
  }


  // User <-> MXID mappings
  async getMxidForDid(did: string): Promise<string | undefined> {
    const row = await this.queryOne<{ matrix_user_id: string }>(
      'SELECT matrix_user_id FROM user_matrix_map WHERE did = $1',
      [did],
    )
    return row?.matrix_user_id
  }


  async setMxidForDid(
    did: string,
    mxid: string,
    password: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO user_matrix_map (did, matrix_user_id, password) VALUES ($1, $2, $3)
       ON CONFLICT (did) DO UPDATE SET matrix_user_id = EXCLUDED.matrix_user_id, password = EXCLUDED.password`,
      [did, mxid, password],
    )
  }


  async getUserPassword(did: string): Promise<string | undefined> {
    const row = await this.queryOne<{ password: string }>(
      'SELECT password FROM user_matrix_map WHERE did = $1',
      [did],
    )
    return row?.password
  }


  // Lookup community by any of its room IDs
  async getCommunityByRoomId(
    roomId: string,
  ): Promise<{ communityUri: string; slug: string } | undefined> {
    const row = await this.queryOne<{ community_uri: string; slug: string }>(
      'SELECT community_uri, slug FROM community_space_map WHERE space_id = $1 OR chamber_a_room_id = $1 OR chamber_b_room_id = $1 OR observer_room_id = $1',
      [roomId],
    )
    return row ? { communityUri: row.community_uri, slug: row.slug } : undefined
  }


  // Get DID by MXID
  async getDidForMxid(mxid: string): Promise<string | undefined> {
    const row = await this.queryOne<{ did: string }>(
      'SELECT did FROM user_matrix_map WHERE matrix_user_id = $1',
      [mxid],
    )
    return row?.did
  }


  // Community membership state
  async setCommunityMembership(
    did: string,
    communityUri: string,
    membershipState: string,
    roles: string[] = [],
  ): Promise<void> {
    await this.run(
      `INSERT INTO community_membership_state (did, community_uri, membership_state, roles_json, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (did, community_uri) DO UPDATE SET
         membership_state = EXCLUDED.membership_state,
         roles_json = EXCLUDED.roles_json,
         updated_at = NOW()`,
      [did, communityUri, membershipState, JSON.stringify(roles)],
    )
  }


  async isActiveCommunityMember(
    did: string,
    communityUri: string,
  ): Promise<boolean> {
    const row = await this.queryOne<{ membership_state: string }>(
      'SELECT membership_state FROM community_membership_state WHERE did = $1 AND community_uri = $2',
      [did, communityUri],
    )
    return row?.membership_state === 'active'
  }


  async getActiveCommunityRoomsForDid(did: string): Promise<
    Array<{
      roomId: string
      communityUri: string
      slug: string
      kind: 'main' | 'chamber-a' | 'chamber-b' | 'observers'
    }>
  > {
    const rows = await this.queryAll<{
      space_id: string
      community_uri: string
      slug: string
      chamber_mode: string
      chamber_a_room_id: string | null
      chamber_b_room_id: string | null
      observer_room_id: string | null
      roles_json: string
      chamber: string | null
    }>(
      `SELECT
        csm.space_id, csm.community_uri, csm.slug, csm.chamber_mode,
        csm.chamber_a_room_id, csm.chamber_b_room_id, csm.observer_room_id,
        cms.roles_json, ca.chamber
       FROM community_space_map csm
       INNER JOIN community_membership_state cms ON cms.community_uri = csm.community_uri
       LEFT JOIN chamber_assignment ca ON ca.community_uri = csm.community_uri AND ca.did = cms.did
       WHERE cms.did = $1 AND cms.membership_state = 'active'`,
      [did],
    )

    const result: Array<{
      roomId: string
      communityUri: string
      slug: string
      kind: 'main' | 'chamber-a' | 'chamber-b' | 'observers'
    }> = []

    for (const row of rows) {
      result.push({
        roomId: row.space_id,
        communityUri: row.community_uri,
        slug: row.slug,
        kind: 'main',
      })

      if (row.chamber_mode !== 'bicameral') continue

      const roles = JSON.parse(row.roles_json || '[]') as string[]
      const isObserver = roles.includes('observer')
      if (isObserver && row.observer_room_id) {
        result.push({
          roomId: row.observer_room_id,
          communityUri: row.community_uri,
          slug: row.slug,
          kind: 'observers',
        })
        continue
      }

      if (row.chamber === 'A' && row.chamber_a_room_id) {
        result.push({
          roomId: row.chamber_a_room_id,
          communityUri: row.community_uri,
          slug: row.slug,
          kind: 'chamber-a',
        })
      } else if (row.chamber === 'B' && row.chamber_b_room_id) {
        result.push({
          roomId: row.chamber_b_room_id,
          communityUri: row.community_uri,
          slug: row.slug,
          kind: 'chamber-b',
        })
      }
    }

    return result
  }
}
