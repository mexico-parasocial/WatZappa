import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ChatModerationEngine,
  MESSAGE_REPORT_REASONS,
  isMessageReportReason,
} from '../chat-moderation.js'
import { SqliteBridgeDatabase } from '../db/sqlite-wrapper.js'

const silentLog = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
} as any

const COMMUNITY = 'at://did:plc:board/com.para.community.board/one'
const OTHER_COMMUNITY = 'at://did:plc:board/com.para.community.board/two'
const ROOM = '!one:para'
const OTHER_ROOM = '!two:para'
const AUTHOR = { did: 'did:plc:author', mxid: '@author:para' }
const REPORTER = { did: 'did:plc:reporter', mxid: '@reporter:para' }
// A MAS-native login: an MXID with no bridge-minted session, so no DID.
const UNATTRIBUTABLE_MXID = '@mas-native:para'

/*
 * D2 (PARA/docs/MATRIX-D2-ENCRYPTED-REPORTS-DECISION-2026-09-23.md): a message
 * report carries IDs only, and the client never names the sender's DID. The
 * bridge resolves the sender from its own ingested events and minted sessions.
 */
describe('resolveReportedMessage', () => {
  let db: SqliteBridgeDatabase
  let engine: ChatModerationEngine
  let dbPath: string

  const session = (who: { did: string; mxid: string }) => {
    const now = new Date().toISOString()
    return {
      id: randomUUID(),
      did: who.did,
      mxid: who.mxid,
      deviceId: `DEV-${randomUUID().slice(0, 8)}`,
      friendlyName: null,
      userAgent: null,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    }
  }

  const ingest = (roomId: string, eventId: string, sender: string) =>
    db.insertMatrixEvent({
      roomId,
      eventId,
      sender,
      type: 'm.room.encrypted',
      content: '',
      originServerTs: Date.now(),
    })

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `para-message-report-${randomUUID()}.db`)
    db = new SqliteBridgeDatabase({ dbPath } as any)
    engine = new ChatModerationEngine(db, silentLog)
    await db.setSpaceForCommunity(COMMUNITY, ROOM, 'one')
    await db.setSpaceForCommunity(OTHER_COMMUNITY, OTHER_ROOM, 'two')
    await db.createDeviceSession(session(AUTHOR))
    await db.createDeviceSession(session(REPORTER))
    await ingest(ROOM, '$by-author', AUTHOR.mxid)
    await ingest(ROOM, '$by-reporter', REPORTER.mxid)
    await ingest(ROOM, '$by-mas-native', UNATTRIBUTABLE_MXID)
    await ingest(OTHER_ROOM, '$elsewhere', AUTHOR.mxid)
  })

  afterEach(async () => {
    await db.close()
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // cleanup may fail if the file was never created
    }
  })

  const resolve = (over: Record<string, string | undefined> = {}) =>
    engine.resolveReportedMessage({
      reporterDid: REPORTER.did,
      communityUri: COMMUNITY,
      matrixRoomId: ROOM,
      matrixEventId: '$by-author',
      ...over,
    } as Parameters<ChatModerationEngine['resolveReportedMessage']>[0])

  it('resolves the sender from the event without the client naming a DID', async () => {
    await expect(resolve()).resolves.toEqual({
      ok: true,
      reportedDid: AUTHOR.did,
    })
  })

  it('accepts a client-supplied DID only when it agrees', async () => {
    await expect(resolve({ reportedDid: AUTHOR.did })).resolves.toEqual({
      ok: true,
      reportedDid: AUTHOR.did,
    })
    await expect(
      resolve({ reportedDid: 'did:plc:someone-else' }),
    ).resolves.toEqual({ ok: false, code: 'ReportedDidMismatch' })
  })

  it('refuses a room that belongs to another community', async () => {
    await expect(resolve({ matrixRoomId: OTHER_ROOM })).resolves.toEqual({
      ok: false,
      code: 'RoomNotInCommunity',
    })
  })

  it('refuses an event ID taken from another room', async () => {
    await expect(resolve({ matrixEventId: '$elsewhere' })).resolves.toEqual({
      ok: false,
      code: 'EventNotFound',
    })
  })

  it('refuses an event the bridge never ingested', async () => {
    await expect(resolve({ matrixEventId: '$unknown' })).resolves.toEqual({
      ok: false,
      code: 'EventNotFound',
    })
  })

  it('refuses a sender with no minted session instead of guessing', async () => {
    await expect(resolve({ matrixEventId: '$by-mas-native' })).resolves.toEqual(
      { ok: false, code: 'SenderNotAttributable' },
    )
  })

  it('refuses a self-report', async () => {
    await expect(resolve({ matrixEventId: '$by-reporter' })).resolves.toEqual({
      ok: false,
      code: 'SelfReport',
    })
  })
})

describe('message report reasons', () => {
  it('is a fixed set with no free text', () => {
    for (const reason of MESSAGE_REPORT_REASONS) {
      expect(isMessageReportReason(reason)).toBe(true)
    }
    expect(isMessageReportReason('he said "…" in the chat')).toBe(false)
    expect(isMessageReportReason(undefined)).toBe(false)
  })
})
