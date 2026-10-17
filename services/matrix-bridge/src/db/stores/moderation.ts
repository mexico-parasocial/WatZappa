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

  /**
   * Every mute, ban and lift recorded for a member in a community, oldest
   * first, with no time window: a permanent ban must not age out. Feed it to
   * `effectiveSanction`.
   */
  getSanctionEvents(did: string, communityUri: string): Promise<any[]>

  /** Members with a time-limited mute/ban recorded in the last `sinceDays`. */
  getSubjectsWithTimedSanctions(
    sinceDays: number,
  ): Promise<{ did: string; communityUri: string }[]>

  /** Moderators' dismissals of reports, newest first. */
  getReportDismissalsForCommunity(
    communityUri: string,
    days?: number,
  ): Promise<any[]>

  /**
   * Whether `reporterDid` already reported this message (or, with no event,
   * this member) within `days`. One person's repeat reports are one report.
   */
  hasReportFrom(
    reporterDid: string,
    did: string,
    communityUri: string,
    reportedEventId: string | null,
    days: number,
  ): Promise<boolean>

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
