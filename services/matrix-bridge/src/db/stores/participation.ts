export interface ParticipationStore {

  getParticipationStats(
    did: string,
    communityUri: string,
  ): Promise<any | undefined>

  ensureParticipationStats(
    did: string,
    communityUri: string,
    matrixRoomId?: string,
  ): Promise<void>

  incrementMessageCount(did: string, communityUri: string): Promise<void>

  incrementVoteCount(did: string, communityUri: string): Promise<void>

  incrementProposalCount(did: string, communityUri: string): Promise<void>

  setParticipationRoles(
    did: string,
    communityUri: string,
    roles: {
      isDelegate?: boolean
      isModerator?: boolean
      chamber?: string | null
    },
  ): Promise<void>

  getParticipationStatsByCommunity(communityUri: string): Promise<any[]>

  getMemberList(
    communityUri: string,
    limit?: number,
    offset?: number,
  ): Promise<any[]>

  getActiveCommunityUris(): Promise<string[]>
}
