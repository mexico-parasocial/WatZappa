import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ChatModerationEngine,
  effectiveSanction,
  expiredSanctionKinds,
  sanctionKindsInForce,
} from '../chat-moderation.js'
import { SqliteBridgeDatabase } from '../db/sqlite-wrapper.js'

const NOW = new Date('2026-10-08T12:00:00Z')
const at = (minutesAgo: number) =>
  new Date(NOW.getTime() - minutesAgo * 60_000).toISOString()

function row(over: Record<string, unknown>) {
  return {
    event_type: 'mute',
    sanction_type: null,
    sanction_duration_minutes: null,
    report_reason: null,
    sanctioned_by_did: 'did:plc:mod',
    created_at: at(1),
    ...over,
  }
}

describe('effectiveSanction', () => {
  it('is null with no sanctions', () => {
    expect(effectiveSanction([], NOW)).toBeNull()
  })

  it('keeps a timed mute until it runs out, then drops it', () => {
    const mute = row({ sanction_duration_minutes: 15, created_at: at(10) })
    expect(effectiveSanction([mute], NOW)).toMatchObject({
      type: 'mute',
      until: at(-5),
    })
    const old = row({ sanction_duration_minutes: 15, created_at: at(16) })
    expect(effectiveSanction([old], NOW)).toBeNull()
  })

  it('never ages out a permanent ban, however old', () => {
    const twoYears = 2 * 365 * 24 * 60
    const ban = row({ event_type: 'ban', created_at: at(twoYears) })
    expect(effectiveSanction([ban], NOW)).toMatchObject({
      type: 'ban',
      until: null,
    })
  })

  it('lets a ban outrank a mute', () => {
    expect(
      effectiveSanction(
        [row({ event_type: 'mute' }), row({ event_type: 'ban' })],
        NOW,
      )?.type,
    ).toBe('ban')
  })

  it('lifts only what the lift names', () => {
    const rows = [
      row({ event_type: 'mute' }),
      row({ event_type: 'ban' }),
      row({ event_type: 'sanction_lifted', sanction_type: 'ban' }),
    ]
    expect(effectiveSanction(rows, NOW)?.type).toBe('mute')
    expect(sanctionKindsInForce(rows, NOW)).toEqual(['mute'])
  })

  it('lifts everything when the lift names nothing', () => {
    const rows = [
      row({ event_type: 'mute' }),
      row({ event_type: 'ban' }),
      row({ event_type: 'sanction_lifted', sanction_type: null }),
    ]
    expect(effectiveSanction(rows, NOW)).toBeNull()
  })

  it('applies a sanction made after a lift', () => {
    const rows = [
      row({ event_type: 'ban' }),
      row({ event_type: 'sanction_lifted', sanction_type: 'ban' }),
      row({ event_type: 'ban' }),
    ]
    expect(effectiveSanction(rows, NOW)?.type).toBe('ban')
  })

  it('reads SQLite timestamps (no zone) as UTC, as Hermes would not', () => {
    const mute = row({
      sanction_duration_minutes: 60,
      created_at: '2026-10-08 11:30:00',
    })
    expect(effectiveSanction([mute], NOW)?.until).toBe(
      '2026-10-08T12:30:00.000Z',
    )
  })

  it('carries the moderator and their reason for the audit trail', () => {
    const mute = row({
      report_reason: 'doxxing',
      sanctioned_by_did: 'did:plc:m1',
    })
    expect(effectiveSanction([mute], NOW)).toMatchObject({
      reason: 'doxxing',
      byDid: 'did:plc:m1',
    })
  })
})

describe('expiredSanctionKinds', () => {
  it('reports a timed sanction that ran out and was never lifted', () => {
    const rows = [
      row({
        event_type: 'ban',
        sanction_duration_minutes: 10,
        created_at: at(60),
      }),
    ]
    expect(expiredSanctionKinds(rows, NOW)).toEqual(['ban'])
  })

  it('stops reporting it once a lift is recorded', () => {
    const rows = [
      row({ sanction_duration_minutes: 10, created_at: at(60) }),
      row({ event_type: 'sanction_lifted', sanction_type: 'mute' }),
    ]
    expect(expiredSanctionKinds(rows, NOW)).toEqual([])
  })

  it('ignores sanctions still in force and permanent ones', () => {
    const rows = [
      row({ sanction_duration_minutes: 120, created_at: at(10) }),
      row({ event_type: 'ban', created_at: at(99999) }),
    ]
    expect(expiredSanctionKinds(rows, NOW)).toEqual([])
  })
})

describe('moderation engine', () => {
  const community = 'at://did:plc:community/com.para.community.board/one'
  const target = 'did:plc:target'
  const log = {
    debug() {},
    info() {},
    warn() {},
    error() {},
    trace() {},
  } as never

  let db: SqliteBridgeDatabase
  let engine: ChatModerationEngine

  beforeEach(async () => {
    db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as never)
    engine = new ChatModerationEngine(db, log)
    await db.ensureParticipationStats(target, community)
    await db.ensureParticipationStats('did:plc:other', community)
  })

  afterEach(async () => {
    await db.close()
  })

  const report = (reporterDid: string, matrixEventId?: string) =>
    engine.ingestReport({
      reportedDid: target,
      reporterDid,
      communityUri: community,
      reason: 'spam',
      matrixEventId,
      matrixRoomId: matrixEventId ? '!room:para' : undefined,
    })

  describe('reports from one account count once', () => {
    it('stores a repeat report of the same message only once', async () => {
      expect(await report('did:plc:r1', '$e1')).toBe(true)
      expect(await report('did:plc:r1', '$e1')).toBe(false)
      const events = await db.getModerationEvents(target, community)
      expect(
        events.filter((e) => e.event_type === 'report_received'),
      ).toHaveLength(1)
    })

    it('still takes the same reporter on a different message', async () => {
      await report('did:plc:r1', '$e1')
      expect(await report('did:plc:r1', '$e2')).toBe(true)
    })

    it('does not let one account push someone to "high risk"', async () => {
      for (let i = 0; i < 10; i++) await report('did:plc:one-account', '$e1')
      const badges = await engine.computeBadges(target, community)
      expect(badges.map((b) => b.type)).toContain('reported')
      expect(badges.map((b) => b.type)).not.toContain('contentious')
      expect(badges.map((b) => b.type)).not.toContain('high_risk')
    })

    it('counts distinct people, so real brigades of six still register', async () => {
      for (let i = 0; i < 6; i++) await report(`did:plc:r${i}`, `$e${i}`)
      const badges = await engine.computeBadges(target, community)
      expect(badges.map((b) => b.type)).toContain('high_risk')
    })

    it('counts legacy duplicate rows once, too', async () => {
      // Rows written before the dedup existed.
      for (let i = 0; i < 6; i++) {
        await db.insertModerationEvent({
          did: target,
          communityUri: community,
          eventType: 'report_received',
          reporterDid: 'did:plc:old',
          reportReason: 'spam',
          reportedEventId: '$e1',
        })
      }
      const types = (await engine.computeBadges(target, community)).map(
        (b) => b.type,
      )
      expect(types).toContain('reported')
      expect(types).not.toContain('high_risk')
    })
  })

  describe('dismissing reports', () => {
    it('removes a message from the queue and from the risk badge', async () => {
      await report('did:plc:r1', '$e1')
      await report('did:plc:r2', '$e1')
      expect(await engine.listReports(community)).toHaveLength(1)

      await engine.dismissReports({
        reportedDid: target,
        communityUri: community,
        matrixEventId: '$e1',
        dismissedByDid: 'did:plc:mod',
      })
      expect(await engine.listReports(community)).toHaveLength(0)
      const types = (await engine.computeBadges(target, community)).map(
        (b) => b.type,
      )
      expect(types).not.toContain('reported')
    })

    it('leaves other messages in the queue', async () => {
      await report('did:plc:r1', '$e1')
      await report('did:plc:r2', '$e2')
      await engine.dismissReports({
        reportedDid: target,
        communityUri: community,
        matrixEventId: '$e1',
        dismissedByDid: 'did:plc:mod',
      })
      const queue = await engine.listReports(community)
      expect(queue.map((g) => g.matrixEventId)).toEqual(['$e2'])
    })

    it('closes everything reported about a member when no message is named', async () => {
      await report('did:plc:r1', '$e1')
      await report('did:plc:r2')
      await engine.dismissReports({
        reportedDid: target,
        communityUri: community,
        dismissedByDid: 'did:plc:mod',
      })
      expect(await engine.listReports(community)).toHaveLength(0)
    })

    it('reopens when someone reports it again afterwards', async () => {
      await report('did:plc:r1', '$e1')
      await engine.dismissReports({
        reportedDid: target,
        communityUri: community,
        matrixEventId: '$e1',
        dismissedByDid: 'did:plc:mod',
      })
      await report('did:plc:r2', '$e1')
      const queue = await engine.listReports(community)
      expect(queue).toHaveLength(1)
      expect(queue[0].reporterCount).toBe(1)
    })
  })

  describe('member list privacy', () => {
    beforeEach(async () => {
      await report('did:plc:r1', '$e1')
      await engine.recomputeUser(target, community)
      await engine.recomputeUser('did:plc:other', community)
    })

    const types = (m: { badges: { type: string }[] }) =>
      m.badges.map((b) => b.type)
    const find = (members: any[], did: string) =>
      members.find((m) => m.did === did)

    it("hides another member's risk badges from an ordinary member", async () => {
      const members = await engine.getMemberList(community, 100, 0, {
        did: 'did:plc:other',
        isModerator: false,
      })
      expect(types(find(members, target))).not.toContain('reported')
    })

    it('shows a member their own', async () => {
      const members = await engine.getMemberList(community, 100, 0, {
        did: target,
        isModerator: false,
      })
      expect(types(find(members, target))).toContain('reported')
    })

    it('shows a moderator everyone, with the sanction in force', async () => {
      await engine.ingestSanction({
        targetDid: target,
        communityUri: community,
        sanctionType: 'mute',
        durationMinutes: 60,
        sanctionedByDid: 'did:plc:mod',
      })
      await engine.recomputeUser(target, community)
      const members = await engine.getMemberList(community, 100, 0, {
        did: 'did:plc:mod',
        isModerator: true,
      })
      const entry = find(members, target)
      expect(types(entry)).toContain('sanctioned')
      expect(entry.sanction).toMatchObject({ type: 'mute' })
    })

    it('never sends a sanction to an ordinary member', async () => {
      await engine.ingestSanction({
        targetDid: target,
        communityUri: community,
        sanctionType: 'ban',
        sanctionedByDid: 'did:plc:mod',
      })
      await engine.recomputeUser(target, community)
      const members = await engine.getMemberList(community, 100, 0, {
        did: 'did:plc:other',
        isModerator: false,
      })
      const entry = find(members, target)
      expect(types(entry)).not.toContain('sanctioned')
      expect(entry.sanction).toBeUndefined()
    })
  })

  describe('sanction badge', () => {
    it('stays for a permanent ban past the old 90-day window', async () => {
      await engine.ingestSanction({
        targetDid: target,
        communityUri: community,
        sanctionType: 'ban',
        sanctionedByDid: 'did:plc:mod',
      })
      ;(db as any).inner.db
        .prepare(
          "UPDATE chat_moderation_events SET created_at = datetime('now', '-200 days') WHERE event_type = 'ban'",
        )
        .run()
      const types = (await engine.computeBadges(target, community)).map(
        (b) => b.type,
      )
      expect(types).toContain('sanctioned')
    })

    it('goes when the sanction is lifted', async () => {
      await engine.ingestSanction({
        targetDid: target,
        communityUri: community,
        sanctionType: 'mute',
        sanctionedByDid: 'did:plc:mod',
      })
      await engine.ingestLift({
        targetDid: target,
        communityUri: community,
        sanctionType: 'mute',
        liftedByDid: 'did:plc:mod',
        reason: 'lifted by moderator',
      })
      const types = (await engine.computeBadges(target, community)).map(
        (b) => b.type,
      )
      expect(types).not.toContain('sanctioned')
    })
  })

  describe('expiry sweep', () => {
    const backdate = (minutes: number) =>
      (db as any).inner.db
        .prepare(
          "UPDATE chat_moderation_events SET created_at = datetime('now', '-' || ? || ' minutes') WHERE event_type IN ('mute','ban')",
        )
        .run(minutes)

    it('lifts a mute that ran out, in Matrix and in the record', async () => {
      await engine.ingestSanction({
        targetDid: target,
        communityUri: community,
        sanctionType: 'mute',
        durationMinutes: 15,
        sanctionedByDid: 'did:plc:mod',
      })
      backdate(60)
      const lifted: string[] = []
      const count = await engine.liftExpiredSanctions(
        async (did, uri, kind) => {
          lifted.push(`${did}:${kind}`)
          return true
        },
      )
      expect(count).toBe(1)
      expect(lifted).toEqual([`${target}:mute`])
      // Recorded as lifted: the next sweep has nothing to do.
      expect(await engine.liftExpiredSanctions(async () => true)).toBe(0)
    })

    it('leaves a mute still running alone', async () => {
      await engine.ingestSanction({
        targetDid: target,
        communityUri: community,
        sanctionType: 'mute',
        durationMinutes: 60,
        sanctionedByDid: 'did:plc:mod',
      })
      const lifted: string[] = []
      await engine.liftExpiredSanctions(async (did, _uri, kind) => {
        lifted.push(kind)
        return true
      })
      expect(lifted).toEqual([])
    })

    it('never touches a permanent ban', async () => {
      await engine.ingestSanction({
        targetDid: target,
        communityUri: community,
        sanctionType: 'ban',
        sanctionedByDid: 'did:plc:mod',
      })
      backdate(60 * 24 * 30)
      expect(await engine.liftExpiredSanctions(async () => true)).toBe(0)
    })

    it('retries next sweep when Matrix could not be updated', async () => {
      await engine.ingestSanction({
        targetDid: target,
        communityUri: community,
        sanctionType: 'mute',
        durationMinutes: 15,
        sanctionedByDid: 'did:plc:mod',
      })
      backdate(60)
      expect(await engine.liftExpiredSanctions(async () => false)).toBe(0)
      expect(
        await engine.liftExpiredSanctions(async () => {
          throw new Error('homeserver down')
        }),
      ).toBe(0)
      // Still unrecorded, so the sweep that succeeds lifts it.
      expect(await engine.liftExpiredSanctions(async () => true)).toBe(1)
    })
  })
})
