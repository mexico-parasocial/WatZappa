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
import type { EventBus } from './events/bus.js'

export type BadgeSeverity = 'info' | 'warning' | 'critical'

/**
 * Reasons a chat message can be reported for. A fixed set, not free text: a
 * free-text reason is a channel for pasting the reported message, which F4
 * and D2 rule out (the message stays in the room; moderators read it there).
 */
export const MESSAGE_REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'violence',
  'impersonation',
  'other',
] as const
export type MessageReportReason = (typeof MESSAGE_REPORT_REASONS)[number]

export function isMessageReportReason(
  value: unknown,
): value is MessageReportReason {
  return (MESSAGE_REPORT_REASONS as readonly unknown[]).includes(value)
}

/**
 * What moderators see of the reports against one message (or, for member
 * reports with no event, against one member).
 *
 * Deliberately no reporter identity: `reporterCount` says how many distinct
 * people reported, not who. A moderator in conflict with a reporter cannot use
 * the queue to find them. The message text is not here either (F4, D2): the
 * moderator opens `matrixEventId` in the room from their own client.
 */
export interface ModerationReportGroup {
  reportedDid: string
  matrixRoomId: string | null
  matrixEventId: string | null
  reportCount: number
  reporterCount: number
  reasons: Record<string, number>
  firstReportedAt: string
  lastReportedAt: string
}

/**
 * Report times as ISO-8601 UTC for every driver. Postgres returns a Date;
 * SQLite's datetime('now') returns 'YYYY-MM-DD HH:MM:SS' in UTC without a zone,
 * which some JS engines (Hermes) parse inconsistently.
 */
function toIsoUtc(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  const text = String(value)
  const sqlite = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(
    text,
  )
  if (sqlite) return new Date(`${sqlite[1]}T${sqlite[2]}Z`).toISOString()
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString()
}

/**
 * Reasons a member can be reported for when no message is attached. Fixed for
 * the same reason as message reasons: free text is a channel for pasting what
 * was said, and moderators see these strings in the queue.
 */
export const MEMBER_REPORT_REASONS = [
  'spam',
  'abuse',
  'harassment',
  'hate',
  'violence',
  'impersonation',
  'other',
] as const

export function isMemberReportReason(value: unknown): boolean {
  return (MEMBER_REPORT_REASONS as readonly unknown[]).includes(value)
}

/**
 * Badges that say a member is at risk or restricted. Moderators see them; the
 * member sees their own; nobody else does. Hiding them in the app is not
 * enough, since the member list is an API any member can call.
 */
export const RISK_BADGE_TYPES = [
  'reported',
  'contentious',
  'high_risk',
  'sanctioned',
] as const

export type SanctionKind = 'mute' | 'ban'

/** The longest sanction a moderator can set: one year. Longer is permanent. */
export const MAX_SANCTION_MINUTES = 60 * 24 * 365

/** The longest free-text moderator reason kept with a sanction. */
export const MAX_SANCTION_REASON_LENGTH = 500

export interface EffectiveSanction {
  type: SanctionKind
  since: string
  /** ISO time the sanction ends; null when it is permanent. */
  until: string | null
  reason: string | null
  byDid: string | null
}

type SanctionRow = {
  event_type: string
  sanction_type?: string | null
  sanction_duration_minutes?: number | null
  report_reason?: string | null
  sanctioned_by_did?: string | null
  created_at: unknown
}

/**
 * Replay a member's mute, ban and lift events (oldest first) into what is in
 * force: the latest mute and the latest ban, each cleared by a later lift.
 * Rows other than those three are ignored.
 */
function currentSanctions(
  rows: SanctionRow[],
): Partial<Record<SanctionKind, EffectiveSanction>> {
  const current: Partial<Record<SanctionKind, EffectiveSanction>> = {}
  for (const row of rows) {
    if (row.event_type === 'mute' || row.event_type === 'ban') {
      const sinceMs = Date.parse(toIsoUtc(row.created_at))
      const minutes = row.sanction_duration_minutes
      current[row.event_type] = {
        type: row.event_type,
        since: new Date(sinceMs).toISOString(),
        until: minutes
          ? new Date(sinceMs + minutes * 60_000).toISOString()
          : null,
        reason: row.report_reason ?? null,
        byDid: row.sanctioned_by_did ?? null,
      }
    } else if (row.event_type === 'sanction_lifted') {
      // A lift names what it lifted; one that names neither lifts both.
      if (row.sanction_type === 'mute' || row.sanction_type === 'ban') {
        delete current[row.sanction_type]
      } else {
        delete current.mute
        delete current.ban
      }
    }
  }
  return current
}

function isInForce(s: EffectiveSanction | undefined, now: Date): boolean {
  return !!s && (s.until === null || Date.parse(s.until) > now.getTime())
}

/**
 * What restricts a member right now, or null. A ban outranks a mute. Pass the
 * full history from `getSanctionEvents`: a permanent ban never ages out.
 */
export function effectiveSanction(
  rows: SanctionRow[],
  now: Date = new Date(),
): EffectiveSanction | null {
  const current = currentSanctions(rows)
  if (isInForce(current.ban, now)) return current.ban!
  if (isInForce(current.mute, now)) return current.mute!
  return null
}

/** Every kind in force right now: a member can be muted and banned at once. */
export function sanctionKindsInForce(
  rows: SanctionRow[],
  now: Date = new Date(),
): SanctionKind[] {
  const current = currentSanctions(rows)
  return (['ban', 'mute'] as const).filter((kind) =>
    isInForce(current[kind], now),
  )
}

/**
 * Sanctions that ran out but were never lifted, so Matrix may still hold
 * them. Lifting records a `sanction_lifted` event, which clears them here.
 */
export function expiredSanctionKinds(
  rows: SanctionRow[],
  now: Date = new Date(),
): SanctionKind[] {
  const current = currentSanctions(rows)
  return (['ban', 'mute'] as const).filter(
    (kind) => current[kind] && !isInForce(current[kind], now),
  )
}

export type ReportedMessageResolution =
  | { ok: true; reportedDid: string }
  | {
      ok: false
      code:
        | 'RoomNotInCommunity'
        | 'EventNotFound'
        | 'SenderNotAttributable'
        | 'ReportedDidMismatch'
        | 'SelfReport'
    }

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
  private events?: EventBus

  /** Late-injected SSE bus (main wires it after construction). */
  setEventBus(events: EventBus): void {
    this.events = events
  }
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
  /**
   * Who sent a reported chat message, resolved on the bridge rather than taken
   * from the client.
   *
   * The reporter only knows the sender's MXID, and since CD-M1 an MXID does not
   * reveal a DID to clients, so the app cannot and should not name one. The
   * bridge resolves it from its own ingested events and minted sessions, and a
   * client-supplied `reportedDid`, if any, must agree: otherwise anyone could
   * pin a report on anyone by naming a DID beside an unrelated event.
   */
  async resolveReportedMessage(params: {
    reporterDid: string
    communityUri: string
    matrixRoomId: string
    matrixEventId: string
    reportedDid?: string
  }): Promise<ReportedMessageResolution> {
    const community = await this.db.getCommunityByRoomId(params.matrixRoomId)
    if (!community || community.communityUri !== params.communityUri) {
      return { ok: false, code: 'RoomNotInCommunity' }
    }
    const sender = await this.db.getEventSender(
      params.matrixRoomId,
      params.matrixEventId,
    )
    if (!sender) return { ok: false, code: 'EventNotFound' }
    // An MXID without a bridge-minted session (e.g. a MAS-native login) has no
    // DID here. That is the CD-M1 boundary holding, not a lookup miss.
    const reportedDid = await this.db.getDidForMxid(sender)
    if (!reportedDid) return { ok: false, code: 'SenderNotAttributable' }
    if (params.reportedDid && params.reportedDid !== reportedDid) {
      return { ok: false, code: 'ReportedDidMismatch' }
    }
    if (reportedDid === params.reporterDid) {
      return { ok: false, code: 'SelfReport' }
    }
    return { ok: true, reportedDid }
  }

  /**
   * Record a report. One reporter's repeat reports of the same message (or,
   * with no message, the same member within 30 days) are one report: counting
   * rows would let a single account push someone to "high risk". Returns
   * whether a new report was stored.
   */
  async ingestReport(params: {
    reportedDid: string
    reporterDid: string
    communityUri: string
    reason: string
    matrixEventId?: string
    matrixRoomId?: string
  }): Promise<boolean> {
    const repeat = await this.db.hasReportFrom(
      params.reporterDid,
      params.reportedDid,
      params.communityUri,
      params.matrixEventId ?? null,
      params.matrixEventId ? 36_500 : 30,
    )
    if (repeat) return false
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
    return true
  }

  /**
   * Record a sanction applied by a moderator. The reason is the moderator's
   * own words about why; it is kept for the audit trail, shown to moderators,
   * and stored in `report_reason`, which no other non-report event uses.
   */
  async ingestSanction(params: {
    targetDid: string
    communityUri: string
    sanctionType: SanctionKind
    durationMinutes?: number | null
    sanctionedByDid: string
    reason?: string | null
  }): Promise<void> {
    await this.db.insertModerationEvent({
      did: params.targetDid,
      communityUri: params.communityUri,
      eventType: params.sanctionType,
      sanctionType: params.sanctionType,
      sanctionDurationMinutes: params.durationMinutes ?? null,
      sanctionedByDid: params.sanctionedByDid,
      reportReason: params.reason ?? null,
    })
    this.log.debug(
      { target: params.targetDid, type: params.sanctionType },
      'Sanction ingested',
    )
  }

  /** Record that a moderator lifted a sanction (or the bridge, on expiry). */
  async ingestLift(params: {
    targetDid: string
    communityUri: string
    sanctionType: SanctionKind | null
    liftedByDid: string | null
    reason: string
  }): Promise<void> {
    await this.db.insertModerationEvent({
      did: params.targetDid,
      communityUri: params.communityUri,
      eventType: 'sanction_lifted',
      sanctionType: params.sanctionType,
      sanctionedByDid: params.liftedByDid,
      reportReason: params.reason,
    })
  }

  /** What restricts this member now, or null. */
  async getSanction(
    did: string,
    communityUri: string,
  ): Promise<EffectiveSanction | null> {
    return effectiveSanction(await this.db.getSanctionEvents(did, communityUri))
  }

  /**
   * A moderator reviewed the reports against a message (or, with no event,
   * everything reported about the member so far) and closed them. Dismissed
   * reports leave the queue and stop counting toward risk badges; a new report
   * made afterwards opens it again.
   */
  async dismissReports(params: {
    reportedDid: string
    communityUri: string
    matrixEventId?: string | null
    dismissedByDid: string
  }): Promise<void> {
    await this.db.insertModerationEvent({
      did: params.reportedDid,
      communityUri: params.communityUri,
      eventType: 'report_dismissed',
      reportedEventId: params.matrixEventId ?? null,
      sanctionedByDid: params.dismissedByDid,
    })
    await this.recomputeUser(params.reportedDid, params.communityUri)
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
    // Distinct people, not rows, and only reports no moderator has closed
    // since: a dismissal covers its message, or every earlier report when it
    // names no message. `id` orders events; timestamps tie within a second.
    const since30d = now.getTime() - 30 * 24 * 60 * 60 * 1000
    const dismissals = events.filter(
      (e: any) => e.event_type === 'report_dismissed',
    )
    const reporters = new Set<string>()
    for (const e of events) {
      if (e.event_type !== 'report_received') continue
      if (Date.parse(toIsoUtc(e.created_at)) <= since30d) continue
      const dismissed = dismissals.some(
        (d: any) =>
          d.id > e.id &&
          (d.reported_event_id == null ||
            d.reported_event_id === e.reported_event_id),
      )
      if (dismissed) continue
      reporters.add(e.reporter_did ?? `report:${e.id}`)
    }
    const reports30d = reporters.size

    // From the full history: a permanent ban does not age out at 90 days, and
    // a lifted or expired sanction is gone.
    const activeSanction = await this.getSanction(did, communityUri)

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
    const before = await this.db.getUserBadges(did, communityUri)
    const badges = await this.computeBadges(did, communityUri)
    await this.saveBadges(did, communityUri, badges)

    // SSE: publish only on change so the periodic cron doesn't spam the bus.
    if (this.events) {
      const sig = (list: ChatBadge[]) =>
        list
          .map((b) => `${b.type}:${b.visibleInChat ? 1 : 0}`)
          .sort()
          .join('|')
      if (sig(before ?? []) !== sig(badges)) {
        await this.events.publish({
          type: 'badge.updated',
          communityUri,
          audienceDids: [did],
          payload: {
            communityUri,
            badges: badges.filter((b) => b.visibleInChat).map((b) => b.type),
          },
        })
      }
    }
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
   *
   * Risk and sanction badges are filtered here, by who is asking: moderators
   * get them all, and with the sanction in force; a member gets only their own.
   */
  async getMemberList(
    communityUri: string,
    limit: number,
    offset: number,
    viewer: { did: string; isModerator: boolean },
  ): Promise<
    Array<{
      did: string
      badges: ChatBadge[]
      participation: ParticipationSummary | null
      lastActiveAt?: string
      sanction?: Pick<EffectiveSanction, 'type' | 'until'>
    }>
  > {
    const rows = await this.db.getMemberList(communityUri, limit, offset)
    const isRisk = (type: string) =>
      (RISK_BADGE_TYPES as readonly string[]).includes(type)
    return Promise.all(
      rows.map(async (row: any) => {
        const canSeeRisk = viewer.isModerator || row.did === viewer.did
        const badges = (await this.db.getUserBadges(row.did, communityUri))
          .filter((b: any) => canSeeRisk || !isRisk(b.badge_type))
          .map((b: any) =>
            this.makeBadge(b.badge_type, b.visible_in_chat === 1),
          )
        const entry: {
          did: string
          badges: ChatBadge[]
          participation: ParticipationSummary | null
          lastActiveAt?: string
          sanction?: Pick<EffectiveSanction, 'type' | 'until'>
        } = {
          did: row.did,
          badges,
          participation: await this.getParticipationSummary(
            row.did,
            communityUri,
          ),
          lastActiveAt: row.last_message_at,
        }
        if (viewer.isModerator && badges.some((b) => b.type === 'sanctioned')) {
          const sanction = await this.getSanction(row.did, communityUri)
          if (sanction) {
            entry.sanction = { type: sanction.type, until: sanction.until }
          }
        }
        return entry
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
    }
  }

  /**
   * The community's report queue, grouped by reported message (or by member
   * for reports with no event), newest activity first.
   */
  async listReports(
    communityUri: string,
    opts: { days?: number; limit?: number } = {},
  ): Promise<ModerationReportGroup[]> {
    const days = opts.days ?? 30
    const allRows = await this.db.getRecentReportsForCommunity(
      communityUri,
      days,
    )
    const dismissals = await this.db.getReportDismissalsForCommunity(
      communityUri,
      days,
    )
    const rows = allRows.filter(
      (row: any) =>
        !dismissals.some(
          (d: any) =>
            d.id > row.id &&
            d.did === row.did &&
            (d.reported_event_id == null ||
              d.reported_event_id === row.reported_event_id),
        ),
    )
    const groups = new Map<
      string,
      ModerationReportGroup & { reporters: Set<string> }
    >()
    for (const row of rows) {
      const eventId: string | null = row.reported_event_id ?? null
      const key = eventId ? `event:${eventId}` : `member:${row.did}`
      const createdAt = toIsoUtc(row.created_at)
      let group = groups.get(key)
      if (!group) {
        group = {
          reportedDid: row.did,
          matrixRoomId: row.matrix_room_id ?? null,
          matrixEventId: eventId,
          reportCount: 0,
          reporterCount: 0,
          reasons: {},
          firstReportedAt: createdAt,
          lastReportedAt: createdAt,
          reporters: new Set(),
        }
        groups.set(key, group)
      }
      group.reportCount++
      if (row.reporter_did) group.reporters.add(row.reporter_did)
      const raw = row.report_reason
      const reason =
        isMessageReportReason(raw) || isMemberReportReason(raw) ? raw : 'other'
      group.reasons[reason] = (group.reasons[reason] ?? 0) + 1
      if (createdAt < group.firstReportedAt) group.firstReportedAt = createdAt
      if (createdAt > group.lastReportedAt) group.lastReportedAt = createdAt
    }
    return [...groups.values()]
      .map(({ reporters, ...group }) => ({
        ...group,
        reporterCount: reporters.size,
      }))
      .sort((a, b) => (a.lastReportedAt < b.lastReportedAt ? 1 : -1))
      .slice(0, opts.limit ?? 50)
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

  /**
   * Lift sanctions whose time ran out. `lift` undoes one in Matrix and reports
   * whether it is safe to record as lifted: when it is not (the homeserver was
   * unreachable), the sanction stays open and the next sweep retries, so an
   * expired mute is never left in force without anyone knowing.
   */
  async liftExpiredSanctions(
    lift: (
      did: string,
      communityUri: string,
      kind: SanctionKind,
    ) => Promise<boolean>,
    now: Date = new Date(),
  ): Promise<number> {
    const subjects = await this.db.getSubjectsWithTimedSanctions(
      MAX_SANCTION_MINUTES / (60 * 24) + 1,
    )
    let lifted = 0
    for (const { did, communityUri } of subjects) {
      const rows = await this.db.getSanctionEvents(did, communityUri)
      for (const kind of expiredSanctionKinds(rows, now)) {
        try {
          if (!(await lift(did, communityUri, kind))) continue
          await this.ingestLift({
            targetDid: did,
            communityUri,
            sanctionType: kind,
            liftedByDid: null,
            reason: 'expired',
          })
          lifted++
        } catch (err) {
          this.log.warn(
            { err, did, communityUri, kind },
            'Could not lift expired sanction; will retry',
          )
        }
      }
      if (lifted > 0) await this.recomputeUser(did, communityUri)
    }
    return lifted
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
