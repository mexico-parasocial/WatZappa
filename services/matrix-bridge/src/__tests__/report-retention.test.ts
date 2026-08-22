import { describe, expect, it, vi } from 'vitest'
import { ChatModerationEngine } from '../chat-moderation.js'

/**
 * Boundary suite for F4 (docs/MATRIX_V2.md) — the moderation half.
 *
 * A report must not leave a copy of the reported message in the bridge
 * database. The bridge has no deletion path of any kind, so an excerpt stored
 * here outlives Synapse's 90-day retention and survives redaction, for a member
 * who never consented to the copy. Reports keep `reported_event_id` instead and
 * moderators resolve the content live at review time.
 *
 * Written against a stub database rather than the SQLite fixture used by
 * chat-moderation.test.ts so it runs without the native better-sqlite3 build.
 */

function stubDb() {
  return {
    insertModerationEvent: vi.fn(async () => {}),
  } as any
}

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
} as any

const report = {
  reportedDid: 'did:plc:reported',
  reporterDid: 'did:plc:reporter',
  communityUri: 'at://did:plc:community/com.para.community.board/test',
  reason: 'spam',
  matrixEventId: '$event-1',
  matrixRoomId: '!room:example.org',
}

describe('moderation reports — no stored message content (F4)', () => {
  it('persists no excerpt of the reported message', async () => {
    const db = stubDb()
    await new ChatModerationEngine(db, logger).ingestReport(report)

    const [event] = db.insertModerationEvent.mock.calls[0]
    expect(event).not.toHaveProperty('reportedMessagePreview')

    // Nothing on the persisted event should carry message text under any name.
    const serialised = JSON.stringify(event)
    expect(serialised).not.toContain('preview')
  })

  it('keeps the pointer moderators need to resolve content live', async () => {
    const db = stubDb()
    await new ChatModerationEngine(db, logger).ingestReport(report)

    const [event] = db.insertModerationEvent.mock.calls[0]
    expect(event.reportedEventId).toBe('$event-1')
    expect(event.matrixRoomId).toBe('!room:example.org')
  })

  it('still records who was reported, by whom, and why', async () => {
    // Dropping the excerpt must not cost the report its usefulness.
    const db = stubDb()
    await new ChatModerationEngine(db, logger).ingestReport(report)

    const [event] = db.insertModerationEvent.mock.calls[0]
    expect(event.did).toBe('did:plc:reported')
    expect(event.reporterDid).toBe('did:plc:reporter')
    expect(event.reportReason).toBe('spam')
    expect(event.eventType).toBe('report_received')
  })

  it('ignores a message excerpt a caller tries to attach anyway', async () => {
    // `ingestReport` has no `context` parameter, so an excerpt cannot reach the
    // database even if a stale client or a later caller supplies one.
    const db = stubDb()
    await new ChatModerationEngine(db, logger).ingestReport({
      ...report,
      context: 'the exact words that were reported',
    } as any)

    const serialised = JSON.stringify(db.insertModerationEvent.mock.calls[0][0])
    expect(serialised).not.toContain('the exact words that were reported')
  })
})
