export interface ModerationStore {

  insertModerationEvent(event: {
    did: string
    communityUri: string
    eventType: string
    reporterDid?: string | null
    reportReason?: string | null
    reportedEventId?: string | null
    sanctionType?: string | null
    sanctionDurationMinutes?: number | null
    sanctionedByDid?: string | null
    matrixRoomId?: string | null
  }): Promise<void>

  getModerationEvents(
    did: string,
    communityUri: string,
    sinceDays?: number,
  ): Promise<any[]>

  purgeReportedMessagePreviews(): Promise<number>

  getRecentReportsForCommunity(
    communityUri: string,
    days?: number,
  ): Promise<any[]>

  getActiveSanctions(did: string, communityUri: string): Promise<any[]>

  setUserBadge(badge: {
    did: string
    communityUri: string
    badgeType: string
    severity?: string | null
    visibleInChat?: number
    expiresAt?: string | null
  }): Promise<void>

  clearUserBadges(did: string, communityUri: string): Promise<void>

  getUserBadges(did: string, communityUri: string): Promise<any[]>

  getCommunityBadgeSummary(
    communityUri: string,
  ): Promise<{ warning: number; critical: number }>

  expireBadges(): Promise<{ did: string; communityUri: string }[]>
}
