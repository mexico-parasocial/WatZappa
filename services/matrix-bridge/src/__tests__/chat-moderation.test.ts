import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChatModerationEngine } from '../chat-moderation.js'
import { BridgeDatabase } from '../db.js'

function createLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    trace: () => {},
  } as any
}

describe('ChatModerationEngine', () => {
  let db: BridgeDatabase
  let engine: ChatModerationEngine
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `para-chat-mod-test-${Date.now()}.db`)
    db = new BridgeDatabase({ dbPath } as any)
    engine = new ChatModerationEngine(db, createLogger())
  })

  afterEach(() => {
    db.close()
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // cleanup may fail if file didn't exist
    }
  })

  const COMMUNITY = 'at://did:plc:community/com.para.community.board/test'
  const DID = 'did:plc:user123'

  describe('badge computation — risk', () => {
    it('returns no risk badges for clean user', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      const badges = engine.computeBadges(DID, COMMUNITY)
      const riskBadges = badges.filter(
        (b) => b.visibleInChat && b.severity !== 'info',
      )
      expect(riskBadges.length).toBe(0)
    })

    it('assigns reported badge for 1 report in 30 days', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      engine.ingestReport({
        reportedDid: DID,
        reporterDid: 'did:plc:reporter',
        communityUri: COMMUNITY,
        reason: 'spam',
      })
      const badges = engine.computeBadges(DID, COMMUNITY)
      const reported = badges.find((b) => b.type === 'reported')
      expect(reported).toBeDefined()
      expect(reported?.visibleInChat).toBe(true)
      expect(reported?.severity).toBe('warning')
    })

    it('assigns contentious badge for 3 reports in 30 days', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      for (let i = 0; i < 3; i++) {
        engine.ingestReport({
          reportedDid: DID,
          reporterDid: `did:plc:reporter${i}`,
          communityUri: COMMUNITY,
          reason: 'abuse',
        })
      }
      const badges = engine.computeBadges(DID, COMMUNITY)
      const contentious = badges.find((b) => b.type === 'contentious')
      expect(contentious).toBeDefined()
      expect(contentious?.severity).toBe('warning')
    })

    it('assigns high_risk badge for 6 reports in 30 days', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      for (let i = 0; i < 6; i++) {
        engine.ingestReport({
          reportedDid: DID,
          reporterDid: `did:plc:reporter${i}`,
          communityUri: COMMUNITY,
          reason: 'hate',
        })
      }
      const badges = engine.computeBadges(DID, COMMUNITY)
      const highRisk = badges.find((b) => b.type === 'high_risk')
      expect(highRisk).toBeDefined()
      expect(highRisk?.severity).toBe('critical')
    })

    it('sanctioned badge takes priority over high_risk', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      for (let i = 0; i < 6; i++) {
        engine.ingestReport({
          reportedDid: DID,
          reporterDid: `did:plc:reporter${i}`,
          communityUri: COMMUNITY,
          reason: 'hate',
        })
      }
      engine.ingestSanction({
        targetDid: DID,
        communityUri: COMMUNITY,
        sanctionType: 'mute',
        durationMinutes: 60,
        sanctionedByDid: 'did:plc:mod',
      })
      const badges = engine.computeBadges(DID, COMMUNITY)
      const sanctioned = badges.find((b) => b.type === 'sanctioned')
      const highRisk = badges.find((b) => b.type === 'high_risk')
      expect(sanctioned).toBeDefined()
      expect(highRisk).toBeUndefined()
    })
  })

  describe('badge computation — context', () => {
    it('assigns newcomer badge for recent join with few messages', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      const badges = engine.computeBadges(DID, COMMUNITY)
      const newcomer = badges.find((b) => b.type === 'newcomer')
      expect(newcomer).toBeDefined()
      expect(newcomer?.visibleInChat).toBe(true)
    })

    it('assigns lurker badge for old member with no messages', () => {
      // Simulate old join by inserting directly
      db.ensureParticipationStats(DID, COMMUNITY)
      ;(db as any).db
        .prepare(
          "UPDATE chat_participation_stats SET joined_at = datetime('now', '-60 days') WHERE did = ? AND community_uri = ?",
        )
        .run(DID, COMMUNITY)
      const badges = engine.computeBadges(DID, COMMUNITY)
      const lurker = badges.find((b) => b.type === 'lurker')
      expect(lurker).toBeDefined()
    })
  })

  describe('badge computation — participation', () => {
    it('assigns voter badge after recording a vote', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      engine.recordVote(DID, COMMUNITY)
      const badges = engine.computeBadges(DID, COMMUNITY)
      const voter = badges.find((b) => b.type === 'voter')
      expect(voter).toBeDefined()
      expect(voter?.visibleInChat).toBe(false)
    })

    it('assigns proposer badge after recording a proposal', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      engine.recordProposal(DID, COMMUNITY)
      const badges = engine.computeBadges(DID, COMMUNITY)
      const proposer = badges.find((b) => b.type === 'proposer')
      expect(proposer).toBeDefined()
    })

    it('assigns active_citizen for high engagement', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      // Simulate 50 messages, 3 votes, 1 proposal
      ;(db as any).db
        .prepare(
          'UPDATE chat_participation_stats SET message_count = 50, votes_cast = 3, proposals_created = 1 WHERE did = ? AND community_uri = ?',
        )
        .run(DID, COMMUNITY)
      const badges = engine.computeBadges(DID, COMMUNITY)
      const activeCitizen = badges.find((b) => b.type === 'active_citizen')
      expect(activeCitizen).toBeDefined()
    })

    it('assigns chamber_a when chamber is set', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      db.setParticipationRoles(DID, COMMUNITY, { chamber: 'A' })
      const badges = engine.computeBadges(DID, COMMUNITY)
      const chamberA = badges.find((b) => b.type === 'chamber_a')
      expect(chamberA).toBeDefined()
    })
  })

  describe('persistence', () => {
    it('saves and retrieves badges from cache', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      engine.recordVote(DID, COMMUNITY)
      const computed = engine.computeBadges(DID, COMMUNITY)
      engine.saveBadges(DID, COMMUNITY, computed)

      const cached = db.getUserBadges(DID, COMMUNITY)
      expect(cached.length).toBeGreaterThan(0)
      expect(cached.some((b: any) => b.badge_type === 'voter')).toBe(true)
    })

    it('recomputeCommunity updates all members', () => {
      const members = ['did:plc:a', 'did:plc:b', 'did:plc:c']
      for (const did of members) {
        db.ensureParticipationStats(did, COMMUNITY)
        engine.recordVote(did, COMMUNITY)
      }
      const count = engine.recomputeCommunity(COMMUNITY)
      expect(count).toBe(3)
    })
  })

  describe('dashboard', () => {
    it('returns summary for community', () => {
      db.ensureParticipationStats(DID, COMMUNITY)
      engine.recordVote(DID, COMMUNITY)
      engine.ingestReport({
        reportedDid: DID,
        reporterDid: 'did:plc:rep',
        communityUri: COMMUNITY,
        reason: 'spam',
      })
      engine.recomputeUser(DID, COMMUNITY)

      const dashboard = engine.getDashboard(COMMUNITY)
      expect(dashboard.totalMembers).toBe(1)
      expect(dashboard.reportedThisWeek).toBe(1)
    })
  })
})
