import type {
  CommunitySpaceMap,
} from '../records.js'

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

  getMxidForDid(did: string): Promise<string | undefined>

  setMxidForDid(did: string, mxid: string, password: string): Promise<void>

  getUserPassword(did: string): Promise<string | undefined>

  getCommunityByRoomId(
    roomId: string,
  ): Promise<{ communityUri: string; slug: string } | undefined>

  getDidForMxid(mxid: string): Promise<string | undefined>

  setCommunityMembership(
    did: string,
    communityUri: string,
    membershipState: string,
    roles?: string[],
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
