/**
 * Chat Moderation Engine
 *
 * Computes moderation badges (risk + participation) for community chat members.
 * Risk badges are visible by default in chat context.
 * Participation badges are visible in member profile / member list.
 *
 * No public profile scores. No gamification. Contextual moderation only.
 */

import type { Logger } from 'pino'
import type { BridgeDatabase } from './db.js'

export type BadgeSeverity = 'info' | 'warning' | 'critical'

export interface ChatBadge {
  type: string
  label: string
  icon: string
  severity: BadgeSeverity
  visibleInChat: boolean
  since?: string
  expiresAt?: string | null
}

export interface ParticipationSummary {
  did: string
  communityUri: string
  tier: string
  messageCount: number
  votesCast: number
  proposalsCreated: number
  daysInCommunity: number
  chamber?: string | null
  isDelegate: boolean
  isModerator: boolean
}

const BADGE_DEFS: Record<
  string,
  { label: string; icon: string; severity: BadgeSeverity }
> = {
  reported: { label: 'Reportado', icon: '⚠️', severity: 'warning' },
  contentious: { label: 'Conflictivo', icon: '🔥', severity: 'warning' },
  high_risk: { label: 'Alto riesgo', icon: '⛔', severity: 'critical' },
  sanctioned: { label: 'Sancionado', icon: '🚫', severity: 'critical' },
  newcomer: { label: 'Nuevo', icon: '🆕', severity: 'info' },
  lurker: { label: 'Lurker', icon: '👻', severity: 'info' },
  seed: { label: 'Semilla', icon: '🌱', severity: 'info' },
  voice: { label: 'Voz', icon: '🗣️', severity: 'info' },
  voter: { label: 'Votante', icon: '🗳️', severity: 'info' },
  proposer: { label: 'Propone', icon: '📢', severity: 'info' },
  delegate: { label: 'Delegado', icon: '🏛️', severity: 'info' },
  moderator: { label: 'Moderador', icon: '🛡️', severity: 'info' },
  chamber_a: { label: 'Cámara A', icon: '⚖️', severity: 'info' },
  chamber_b: { label: 'Cámara B', icon: '⚖️', severity: 'info' },
  active_citizen: { label: 'Ciudadano Activo', icon: '⭐', severity: 'info' },
  trusted_voice: { label: 'Voz Confiable', icon: '🎙️', severity: 'info' },
  founder: { label: 'Fundador', icon: '🔥', severity: 'info' },
}

export class ChatModerationEngine {
  constructor(
    private db: BridgeDatabase,
    private log: Logger,
  ) {}

  /**
   * Ingest a user report from the app.
   */
  ingestReport(params: {
    reportedDid: string
    reporterDid: string
    communityUri: string
    reason: string
    context?: string
    matrixEventId?: string
    matrixRoomId?: string
  }): void {
    this.db.insertModerationEvent({
      did: params.reportedDid,
      communityUri: params.communityUri,
      eventType: 'report_received',
      reporterDid: params.reporterDid,
      reportReason: params.reason,
      reportedEventId: params.matrixEventId,
      reportedMessagePreview: params.context?.slice(0, 200) ?? null,
      matrixRoomId: params.matrixRoomId ?? null,
    })
    this.log.debug(
      {
        reported: params.reportedDid,
        reporter: params.reporterDid,
        reason: params.reason,
      },
      'Report ingested',
    )
  }

  /**
   * Ingest a sanction applied by a moderator.
   */
  ingestSanction(params: {
    targetDid: string
    communityUri: string
    sanctionType: 'mute' | 'ban' | 'redact'
    durationMinutes?: number
    sanctionedByDid: string
    matrixRoomId?: string
  }): void {
    this.db.insertModerationEvent({
      did: params.targetDid,
      communityUri: params.communityUri,
      eventType: params.sanctionType,
      sanctionType: params.sanctionType,
      sanctionDurationMinutes: params.durationMinutes ?? null,
      sanctionedByDid: params.sanctionedByDid,
      matrixRoomId: params.matrixRoomId ?? null,
    })
    this.log.debug(
      { target: params.targetDid, type: params.sanctionType },
      'Sanction ingested',
    )
  }

  /**
   * Record a message sent by a user in a community room.
   */
  recordMessage(
    did: string,
    communityUri: string,
    matrixRoomId?: string,
  ): void {
    this.db.ensureParticipationStats(did, communityUri, matrixRoomId)
    this.db.incrementMessageCount(did, communityUri)
  }

  /**
   * Record a vote cast by a user.
   */
  recordVote(did: string, communityUri: string): void {
    this.db.ensureParticipationStats(did, communityUri)
    this.db.incrementVoteCount(did, communityUri)
  }

  /**
   * Record a proposal created by a user.
   */
  recordProposal(did: string, communityUri: string): void {
    this.db.ensureParticipationStats(did, communityUri)
    this.db.incrementProposalCount(did, communityUri)
  }

  /**
   * Record membership / role changes.
   */
  recordMembership(
    did: string,
    communityUri: string,
    matrixRoomId: string,
    roles: {
      isDelegate?: boolean
      isModerator?: boolean
      chamber?: string | null
    },
  ): void {
    this.db.ensureParticipationStats(did, communityUri, matrixRoomId)
    this.db.setParticipationRoles(did, communityUri, roles)
  }

  /**
   * Compute all badges for a user in a community.
   */
  computeBadges(did: string, communityUri: string): ChatBadge[] {
    const stats = this.db.getParticipationStats(did, communityUri)
    const events = this.db.getModerationEvents(did, communityUri, 90)
    const now = new Date()

    const badges: ChatBadge[] = []

    // --- RISK BADGES (visible in chat by default) ---
    const reports30d = events.filter(
      (e: any) =>
        e.event_type === 'report_received' &&
        new Date(e.created_at) >
          new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    ).length

    const activeSanction = events.find((e: any) => {
      if (!['mute', 'ban'].includes(e.event_type)) return false
      // Simple heuristic: if sanction has no duration, assume permanent
      // if duration exists, check if it's still active
      if (!e.sanction_duration_minutes) return true
      const sanctionEnd =
        new Date(e.created_at).getTime() +
        e.sanction_duration_minutes * 60 * 1000
      return sanctionEnd > now.getTime()
    })

    if (activeSanction) {
      badges.push(this.makeBadge('sanctioned', true))
    } else if (reports30d >= 6) {
      badges.push(this.makeBadge('high_risk', true))
    } else if (reports30d >= 3) {
      badges.push(this.makeBadge('contentious', true))
    } else if (reports30d >= 1) {
      badges.push(this.makeBadge('reported', true))
    }

    // --- CONTEXT BADGES (visible in chat by default) ---
    if (stats) {
      const daysSinceJoin = Math.floor(
        (now.getTime() - new Date(stats.joined_at).getTime()) /
          (1000 * 60 * 60 * 24),
      )
      if (daysSinceJoin < 7 && stats.message_count < 10) {
        badges.push(this.makeBadge('newcomer', true))
      } else if (daysSinceJoin > 30 && stats.message_count < 5) {
        badges.push(this.makeBadge('lurker', true))
      }
    }

    // --- PARTICIPATION BADGES (NOT visible in chat by default) ---
    if (stats) {
      if (stats.message_count >= 1) badges.push(this.makeBadge('seed', false))
      if (stats.message_count >= 10) badges.push(this.makeBadge('voice', false))
      if (stats.votes_cast >= 1) badges.push(this.makeBadge('voter', false))
      if (stats.proposals_created >= 1)
        badges.push(this.makeBadge('proposer', false))
      if (stats.chamber === 'A') badges.push(this.makeBadge('chamber_a', false))
      if (stats.chamber === 'B') badges.push(this.makeBadge('chamber_b', false))
      if (stats.is_delegate) badges.push(this.makeBadge('delegate', false))
      if (stats.is_moderator) badges.push(this.makeBadge('moderator', false))

      // Composite badges
      const daysSinceJoin = Math.floor(
        (now.getTime() - new Date(stats.joined_at).getTime()) /
          (1000 * 60 * 60 * 24),
      )
      if (
        stats.votes_cast >= 3 &&
        stats.proposals_created >= 1 &&
        stats.message_count >= 50
      ) {
        badges.push(this.makeBadge('active_citizen', false))
      }
      if (
        daysSinceJoin >= 180 &&
        stats.message_count >= 100 &&
        stats.votes_cast >= 5 &&
        reports30d === 0
      ) {
        badges.push(this.makeBadge('trusted_voice', false))
      }
      if (
        daysSinceJoin >= 90 &&
        stats.message_count >= 200 &&
        stats.proposals_created >= 3 &&
        !activeSanction &&
        reports30d === 0
      ) {
        badges.push(this.makeBadge('founder', false))
      }
    }

    return badges
  }

  /**
   * Persist computed badges to cache table.
   */
  saveBadges(did: string, communityUri: string, badges: ChatBadge[]): void {
    this.db.clearUserBadges(did, communityUri)
    for (const badge of badges) {
      this.db.setUserBadge({
        did,
        communityUri,
        badgeType: badge.type,
        severity: badge.severity,
        visibleInChat: badge.visibleInChat ? 1 : 0,
        expiresAt: badge.expiresAt ?? null,
      })
    }
  }

  /**
   * Full recompute + save for a single user.
   */
  recomputeUser(did: string, communityUri: string): ChatBadge[] {
    const badges = this.computeBadges(did, communityUri)
    this.saveBadges(did, communityUri, badges)
    return badges
  }

  /**
   * Batch recompute for all members of a community.
   */
  recomputeCommunity(communityUri: string): number {
    const members = this.db.getParticipationStatsByCommunity(communityUri)
    let count = 0
    for (const m of members) {
      this.recomputeUser(m.did, communityUri)
      count++
    }
    this.log.info(
      { community: communityUri, count },
      'Recomputed badges for community',
    )
    return count
  }

  /**
   * Get participation summary for a user.
   */
  getParticipationSummary(
    did: string,
    communityUri: string,
  ): ParticipationSummary | null {
    const stats = this.db.getParticipationStats(did, communityUri)
    if (!stats) return null
    const now = new Date()
    const daysInCommunity = Math.floor(
      (now.getTime() - new Date(stats.joined_at).getTime()) /
        (1000 * 60 * 60 * 24),
    )
    return {
      did,
      communityUri,
      tier: this.computeTier(stats),
      messageCount: stats.message_count,
      votesCast: stats.votes_cast,
      proposalsCreated: stats.proposals_created,
      daysInCommunity,
      chamber: stats.chamber,
      isDelegate: !!stats.is_delegate,
      isModerator: !!stats.is_moderator,
    }
  }

  /**
   * Get member list with badges for a community.
   */
  getMemberList(
    communityUri: string,
    limit = 100,
    offset = 0,
  ): Array<{
    did: string
    matrixUserId?: string
    badges: ChatBadge[]
    participation: ParticipationSummary | null
    lastActiveAt?: string
  }> {
    const rows = this.db.getMemberList(communityUri, limit, offset)
    return rows.map((row: any) => {
      const badges = this.db
        .getUserBadges(row.did, communityUri)
        .map((b: any) => this.makeBadge(b.badge_type, b.visible_in_chat === 1))
      return {
        did: row.did,
        matrixUserId: row.matrix_user_id,
        badges,
        participation: this.getParticipationSummary(row.did, communityUri),
        lastActiveAt: row.last_message_at,
      }
    })
  }

  /**
   * Get dashboard summary for moderators.
   */
  getDashboard(communityUri: string): {
    totalMembers: number
    activeToday: number
    reportedThisWeek: number
    sanctionedNow: number
    riskDistribution: { low: number; warning: number; critical: number }
    recentEvents: any[]
  } {
    const stats = this.db.getParticipationStatsByCommunity(communityUri)
    const summary = this.db.getCommunityBadgeSummary(communityUri)
    const recentReports = this.db.getRecentReportsForCommunity(communityUri, 7)

    const now = new Date()
    const activeToday = stats.filter(
      (s: any) =>
        s.last_message_at &&
        new Date(s.last_message_at) >
          new Date(now.getTime() - 24 * 60 * 60 * 1000),
    ).length

    const sanctionedNow = stats.filter((s: any) => {
      const badges = this.db.getUserBadges(s.did, communityUri)
      return badges.some(
        (b: any) => b.badge_type === 'sanctioned' && b.visible_in_chat === 1,
      )
    }).length

    return {
      totalMembers: stats.length,
      activeToday,
      reportedThisWeek: recentReports.length,
      sanctionedNow,
      riskDistribution: {
        low: stats.length - summary.warning - summary.critical,
        warning: summary.warning,
        critical: summary.critical,
      },
      recentEvents: recentReports.slice(0, 20),
    }
  }

  /**
   * Expire old badges and recompute affected users.
   */
  runExpiry(): number {
    this.db.expireBadges()
    return 0 // TODO: track which users were affected and recompute them
  }

  private makeBadge(type: string, visibleInChat: boolean): ChatBadge {
    const def = BADGE_DEFS[type] ?? {
      label: type,
      icon: '',
      severity: 'info' as BadgeSeverity,
    }
    return {
      type,
      label: def.label,
      icon: def.icon,
      severity: def.severity,
      visibleInChat,
    }
  }

  private computeTier(stats: any): string {
    if (
      stats.proposals_created >= 3 &&
      stats.message_count >= 200 &&
      stats.votes_cast >= 10
    )
      return 'founder'
    if (stats.votes_cast >= 5 && stats.message_count >= 100) return 'gold'
    if (stats.votes_cast >= 1 && stats.proposals_created >= 1) return 'silver'
    if (stats.message_count >= 10 || stats.votes_cast >= 1) return 'bronze'
    return 'base'
  }
}
