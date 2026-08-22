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
import type { IBridgeDatabase } from './db/index.js'

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
    private db: IBridgeDatabase,
    private log: Logger,
  ) {}

  /**
   * Ingest a user report from the app.
   *
   * F4: this deliberately stores no copy of the reported message. It keeps
   * `matrixEventId`, and moderators resolve the content live from Synapse at
   * review time. That way the evidence inherits Synapse's retention and
   * redaction rules instead of outliving them — a reported message used to
   * leave a 200-character excerpt here that survived both the 90-day purge and
   * any redaction, in a store with no deletion path at all.
   *
   * There is deliberately no `context` parameter: an excerpt that cannot be
   * passed in cannot be persisted by a later caller who has not read this.
   */
  async ingestReport(params: {
    reportedDid: string
    reporterDid: string
    communityUri: string
    reason: string
    matrixEventId?: string
    matrixRoomId?: string
  }): Promise<void> {
    await this.db.insertModerationEvent({
      did: params.reportedDid,
      communityUri: params.communityUri,
      eventType: 'report_received',
      reporterDid: params.reporterDid,
      reportReason: params.reason,
      reportedEventId: params.matrixEventId,
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
  async ingestSanction(params: {
    targetDid: string
    communityUri: string
    sanctionType: 'mute' | 'ban' | 'redact'
    durationMinutes?: number
    sanctionedByDid: string
    matrixRoomId?: string
  }): Promise<void> {
    await this.db.insertModerationEvent({
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
  async recordMessage(
    did: string,
    communityUri: string,
    matrixRoomId?: string,
  ): Promise<void> {
    await this.db.ensureParticipationStats(did, communityUri, matrixRoomId)
    await this.db.incrementMessageCount(did, communityUri)
  }

  /**
   * Record a vote cast by a user.
   */
  async recordVote(did: string, communityUri: string): Promise<void> {
    await this.db.ensureParticipationStats(did, communityUri)
    await this.db.incrementVoteCount(did, communityUri)
  }

  /**
   * Record a proposal created by a user.
   */
  async recordProposal(did: string, communityUri: string): Promise<void> {
    await this.db.ensureParticipationStats(did, communityUri)
    await this.db.incrementProposalCount(did, communityUri)
  }

  /**
   * Record membership / role changes.
   */
  async recordMembership(
    did: string,
    communityUri: string,
    matrixRoomId: string,
    roles: {
      isDelegate?: boolean
      isModerator?: boolean
      chamber?: string | null
    },
  ): Promise<void> {
    await this.db.ensureParticipationStats(did, communityUri, matrixRoomId)
    await this.db.setParticipationRoles(did, communityUri, roles)
  }

  /**
   * Compute all badges for a user in a community.
   */
  async computeBadges(did: string, communityUri: string): Promise<ChatBadge[]> {
    const stats = await this.db.getParticipationStats(did, communityUri)
    const events = await this.db.getModerationEvents(did, communityUri, 90)
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
  async saveBadges(
    did: string,
    communityUri: string,
    badges: ChatBadge[],
  ): Promise<void> {
    await this.db.clearUserBadges(did, communityUri)
    for (const badge of badges) {
      await this.db.setUserBadge({
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
  async recomputeUser(did: string, communityUri: string): Promise<ChatBadge[]> {
    const badges = await this.computeBadges(did, communityUri)
    await this.saveBadges(did, communityUri, badges)
    return badges
  }

  /**
   * Batch recompute for all members of a community.
   */
  async recomputeCommunity(communityUri: string): Promise<number> {
    const members = await this.db.getParticipationStatsByCommunity(communityUri)
    let count = 0
    for (const m of members) {
      await this.recomputeUser(m.did, communityUri)
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
  async getParticipationSummary(
    did: string,
    communityUri: string,
  ): Promise<ParticipationSummary | null> {
    const stats = await this.db.getParticipationStats(did, communityUri)
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
  async getMemberList(
    communityUri: string,
    limit = 100,
    offset = 0,
  ): Promise<
    Array<{
      did: string
      matrixUserId?: string
      badges: ChatBadge[]
      participation: ParticipationSummary | null
      lastActiveAt?: string
    }>
  > {
    const rows = await this.db.getMemberList(communityUri, limit, offset)
    return Promise.all(
      rows.map(async (row: any) => {
        const badges = (await this.db.getUserBadges(row.did, communityUri)).map(
          (b: any) => this.makeBadge(b.badge_type, b.visible_in_chat === 1),
        )
        return {
          did: row.did,
          matrixUserId: row.matrix_user_id,
          badges,
          participation: await this.getParticipationSummary(
            row.did,
            communityUri,
          ),
          lastActiveAt: row.last_message_at,
        }
      }),
    )
  }

  /**
   * Get dashboard summary for moderators.
   */
  async getDashboard(communityUri: string): Promise<{
    totalMembers: number
    activeToday: number
    reportedThisWeek: number
    sanctionedNow: number
    riskDistribution: { low: number; warning: number; critical: number }
    recentEvents: any[]
  }> {
    const stats = await this.db.getParticipationStatsByCommunity(communityUri)
    const summary = await this.db.getCommunityBadgeSummary(communityUri)
    const recentReports = await this.db.getRecentReportsForCommunity(
      communityUri,
      7,
    )

    const now = new Date()
    const activeToday = stats.filter(
      (s: any) =>
        s.last_message_at &&
        new Date(s.last_message_at) >
          new Date(now.getTime() - 24 * 60 * 60 * 1000),
    ).length

    let sanctionedNow = 0
    for (const s of stats) {
      const badges = await this.db.getUserBadges(s.did, communityUri)
      if (
        badges.some(
          (b: any) => b.badge_type === 'sanctioned' && b.visible_in_chat === 1,
        )
      ) {
        sanctionedNow++
      }
    }

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
  async runExpiry(): Promise<number> {
    const affected = await this.db.expireBadges()
    let count = 0
    for (const { did, communityUri } of affected) {
      await this.recomputeUser(did, communityUri)
      count++
    }
    if (count > 0) {
      this.log.info({ count }, 'Recomputed badges for expired users')
    }
    return count
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
