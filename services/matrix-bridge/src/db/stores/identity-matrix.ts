import type { CommunitySpaceMap, DeviceSession } from '../records.js'

export interface IdentityMatrixStore {
  getSpaceForCommunity(
    communityUri: string,
  ): Promise<CommunitySpaceMap | undefined>

  setSpaceForCommunity(
    communityUri: string,
    spaceId: string,
    slug: string,
    chamberMode?: string,
  ): Promise<void>

  setChamberRooms(
    communityUri: string,
    chamberA: string | null,
    chamberB: string | null,
    observerRoom: string | null,
  ): Promise<void>

  getChamberAssignment(
    communityUri: string,
    did: string,
  ): Promise<string | undefined>

  setChamberAssignment(
    communityUri: string,
    did: string,
    chamber: string,
  ): Promise<void>

  getChamberMemberCount(communityUri: string, chamber: string): Promise<number>

  getActiveMemberCount(communityUri: string): Promise<number>

  /**
   * Reverse attribution of a chat account to a DID, resolved over the device
   * sessions this bridge minted after a verified proof of possession — there
   * is no mapping table and no forward direction (CD-M1). Transitional until
   * the CD-M2 physical split; never exposed through any API.
   */
  getDidForMxid(mxid: string): Promise<string | undefined>

  getCommunityByRoomId(
    roomId: string,
  ): Promise<{ communityUri: string; slug: string } | undefined>

  createDeviceSession(session: DeviceSession): Promise<void>

  listDeviceSessions(did: string): Promise<DeviceSession[]>

  getDeviceSession(id: string): Promise<DeviceSession | undefined>

  touchDeviceSession(id: string): Promise<void>

  revokeDeviceSession(did: string, id: string): Promise<boolean>

  setCommunityMembership(
    did: string,
    communityUri: string,
    membershipState: string,
    roles?: string[],
  ): Promise<void>

  getCommunityMembership(
    did: string,
    communityUri: string,
  ): Promise<{ state: string; roles: string[] } | undefined>

  /** Every community this DID has membership state for, any state. Used by
   *  the interaction-time access reconciliation (CD-M6): the bridge settles
   *  revocations and role drift at each verified interaction. */
  getMembershipsForDid(
    did: string,
  ): Promise<Array<{ communityUri: string; state: string; roles: string[] }>>

  /**
   * DID-free membership lease (CD-M6): when a chat account last proved
   * currency for a community. Refreshed by every verified interaction
   * (join, reconciliation, attestation); the sweeper evicts expired leases.
   * Keyed by community + MXID — deliberately no DID column.
   */
  upsertCommunityMembershipLease(
    communityUri: string,
    mxid: string,
    verifiedAtIso: string,
  ): Promise<void>

  getExpiredCommunityMembershipLeases(
    cutoffIso: string,
  ): Promise<Array<{ communityUri: string; mxid: string; lastVerifiedAt: string }>>

  deleteCommunityMembershipLease(
    communityUri: string,
    mxid: string,
  ): Promise<void>

  isActiveCommunityMember(did: string, communityUri: string): Promise<boolean>

  getActiveCommunityRoomsForDid(did: string): Promise<
    Array<{
      roomId: string
      communityUri: string
      slug: string
      kind: 'main' | 'chamber-a' | 'chamber-b' | 'observers'
    }>
  >
}
