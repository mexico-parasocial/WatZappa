import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChatModerationEngine } from '../chat-moderation.js'
import { SqliteBridgeDatabase } from '../db/index.js'

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
  let db: SqliteBridgeDatabase
  let engine: ChatModerationEngine
  let dbPath: string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `para-chat-mod-test-${Date.now()}.db`)
    db = new SqliteBridgeDatabase({ dbPath } as any)
    engine = new ChatModerationEngine(db, createLogger())
  })

  afterEach(async () => {
    await db.close()
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // cleanup may fail if file didn't exist
    }
  })

  const COMMUNITY = 'at://did:plc:community/com.para.community.board/test'
  const DID = 'did:plc:user123'

  describe('badge computation — risk', () => {
    it('returns no risk badges for clean user', async () => {
      await db.setCommunityMembership(DID, COMMUNITY, 'active', ['member'])
      const badges = await engine.computeBadges(DID, COMMUNITY)
      const riskBadges = badges.filter(
        (b) => b.visibleInChat && b.severity !== 'info',
      )
      expect(riskBadges.length).toBe(0)
    })

    it('assigns reported badge for 1 report in 30 days', async () => {
      await db.setCommunityMembership(DID, COMMUNITY, 'active', ['member'])
      await engine.ingestReport({
        reportedDid: DID,
        reporterDid: 'did:plc:reporter',
        communityUri: COMMUNITY,
        reason: 'spam',
      })
      const badges = await engine.computeBadges(DID, COMMUNITY)
      const reported = badges.find((b) => b.type === 'reported')
      expect(reported).toBeDefined()
      expect(reported?.visibleInChat).toBe(true)
      expect(reported?.severity).toBe('warning')
    })

    it('assigns contentious badge for 3 reports in 30 days', async () => {
      await db.setCommunityMembership(DID, COMMUNITY, 'active', ['member'])
      for (let i = 0; i < 3; i++) {
        await engine.ingestReport({
          reportedDid: DID,
          reporterDid: `did:plc:reporter${i}`,
          communityUri: COMMUNITY,
          reason: 'abuse',
        })
      }
      const badges = await engine.computeBadges(DID, COMMUNITY)
      const contentious = badges.find((b) => b.type === 'contentious')
      expect(contentious).toBeDefined()
      expect(contentious?.severity).toBe('warning')
    })

    it('assigns high_risk badge for 6 reports in 30 days', async () => {
      await db.setCommunityMembership(DID, COMMUNITY, 'active', ['member'])
      for (let i = 0; i < 6; i++) {
        await engine.ingestReport({
          reportedDid: DID,
          reporterDid: `did:plc:reporter${i}`,
          communityUri: COMMUNITY,
          reason: 'hate',
        })
      }
      const badges = await engine.computeBadges(DID, COMMUNITY)
      const highRisk = badges.find((b) => b.type === 'high_risk')
      expect(highRisk).toBeDefined()
      expect(highRisk?.severity).toBe('critical')
    })

    it('sanctioned badge takes priority over high_risk', async () => {
      await db.setCommunityMembership(DID, COMMUNITY, 'active', ['member'])
      for (let i = 0; i < 6; i++) {
        await engine.ingestReport({
          reportedDid: DID,
          reporterDid: `did:plc:reporter${i}`,
          communityUri: COMMUNITY,
          reason: 'hate',
        })
      }
      await engine.ingestSanction({
        targetDid: DID,
        communityUri: COMMUNITY,
        sanctionType: 'mute',
        durationMinutes: 60,
        sanctionedByDid: 'did:plc:mod',
      })
      const badges = await engine.computeBadges(DID, COMMUNITY)
      const sanctioned = badges.find((b) => b.type === 'sanctioned')
      const highRisk = badges.find((b) => b.type === 'high_risk')
      expect(sanctioned).toBeDefined()
      expect(highRisk).toBeUndefined()
    })
  })

  describe('persistence', () => {
    it('saves and retrieves badges from cache', async () => {
      await db.setCommunityMembership(DID, COMMUNITY, 'active', ['member'])
      await engine.ingestReport({
        reportedDid: DID,
        reporterDid: 'did:plc:reporter',
        communityUri: COMMUNITY,
        reason: 'spam',
      })
      const computed = await engine.computeBadges(DID, COMMUNITY)
      await engine.saveBadges(DID, COMMUNITY, computed)

      const cached = await db.getUserBadges(DID, COMMUNITY)
      expect(cached.length).toBeGreaterThan(0)
      expect(cached.some((b: any) => b.badge_type === 'reported')).toBe(true)
    })

    it('recomputeCommunity updates all members', async () => {
      const members = ['did:plc:a', 'did:plc:b', 'did:plc:c']
      for (const did of members) {
        await db.setCommunityMembership(did, COMMUNITY, 'active', ['member'])
      }
      const count = await engine.recomputeCommunity(COMMUNITY)
      expect(count).toBe(3)
    })
  })

  describe('dashboard', () => {
    it('returns summary for community', async () => {
      await db.setCommunityMembership(DID, COMMUNITY, 'active', ['member'])
      await engine.ingestReport({
        reportedDid: DID,
        reporterDid: 'did:plc:rep',
        communityUri: COMMUNITY,
        reason: 'spam',
      })
      await engine.recomputeUser(DID, COMMUNITY)

      const dashboard = await engine.getDashboard(COMMUNITY)
      expect(dashboard.totalMembers).toBe(1)
      expect(dashboard.reportedThisWeek).toBe(1)
    })
  })
})
