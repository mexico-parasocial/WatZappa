import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PassThrough } from 'node:stream'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatModerationEngine } from '../src/chat-moderation.js'
import type { IBridgeDatabase } from '../src/db/interface.js'
import { PgBridgeDatabase } from '../src/db/pg/index.js'
import { SqliteBridgeDatabase } from '../src/db/sqlite-wrapper.js'
import type { RouteContext } from '../src/routes/context.js'
import {
  apiModerationReportHandler,
  apiModerationReportsHandler,
} from '../src/routes/moderation.js'

// The authenticated caller; each test may switch it (reporter or moderator).
const auth = vi.hoisted(() => ({ did: 'did:plc:reporter' }))
vi.mock('../src/m8-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/m8-auth.js')>()),
  authenticateM8: async () => ({ did: auth.did }),
}))

const reporter = 'did:plc:reporter'
const author = { did: 'did:plc:author', mxid: '@author:para' }
const community = 'at://did:plc:creator/com.para.community.board/one'
const room = '!main:para'
const log = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  trace() {},
} as never

class Response {
  statusCode = 200
  text = ''
  writeHead(status: number) {
    this.statusCode = status
  }
  setHeader() {}
  end(chunk = '') {
    this.text += chunk
  }
  get json() {
    return this.text ? JSON.parse(this.text) : undefined
  }
}

function getRequest(url: string): IncomingMessage {
  const req = new PassThrough() as unknown as IncomingMessage
  req.headers = {}
  req.url = url
  req.method = 'GET'
  ;(req as unknown as PassThrough).end()
  return req
}

function request(body: unknown): IncomingMessage {
  const req = new PassThrough() as unknown as IncomingMessage
  req.headers = {}
  req.url = '/api/moderation-report'
  req.method = 'POST'
  ;(req as unknown as PassThrough).end(JSON.stringify(body))
  return req
}

/*
 * D2: a chat message is reported by room and event with a fixed reason. The
 * app never names the sender's DID; the bridge resolves it. The same suite
 * runs against Postgres when MATRIX_TEST_DATABASE_URL is set.
 */
describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s: POST /api/moderation-report', (driver) => {
  let db: IBridgeDatabase
  let admin: pg.Pool | undefined
  let schema: string
  let ctx: RouteContext

  beforeEach(async () => {
    auth.did = reporter
    if (driver === 'postgres') {
      const url = new URL(process.env.MATRIX_TEST_DATABASE_URL!)
      admin = new pg.Pool({ connectionString: url.toString() })
      schema = `test_${randomUUID().replaceAll('-', '')}`
      await admin.query(`CREATE SCHEMA ${schema}`)
      url.searchParams.set('options', `-c search_path=${schema}`)
      db = new PgBridgeDatabase(url.toString())
    } else {
      db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as never)
    }
    ctx = {
      db,
      config: { port: 3001 },
      chatMod: new ChatModerationEngine(db, log),
      log,
    } as unknown as RouteContext
    await db.setSpaceForCommunity(community, room, 'one')
    await db.setCommunityMembership(reporter, community, 'active', [])
    const now = new Date().toISOString()
    await db.createDeviceSession({
      id: randomUUID(),
      did: author.did,
      mxid: author.mxid,
      deviceId: 'DEVAUTHOR',
      friendlyName: null,
      userAgent: null,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    })
    await db.insertMatrixEvent({
      roomId: room,
      eventId: '$reported',
      sender: author.mxid,
      type: 'm.room.encrypted',
      content: '',
      originServerTs: Date.now(),
    })
  })

  afterEach(async () => {
    await db.close()
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
    }
  })

  async function post(body: Record<string, unknown>) {
    const res = new Response()
    await apiModerationReportHandler(
      request({ reporterDid: reporter, communityUri: community, ...body }),
      res as unknown as ServerResponse,
      ctx,
    )
    return res
  }

  it('records a message report against the resolved sender, IDs only', async () => {
    const res = await post({
      matrixRoomId: room,
      matrixEventId: '$reported',
      reason: 'harassment',
      context: 'text a client must not be able to store',
    })
    expect(res.statusCode).toBe(200)

    const events = await db.getModerationEvents(author.did, community)
    expect(events).toHaveLength(1)
    const stored = JSON.stringify(events[0])
    expect(stored).toContain('$reported')
    expect(stored).toContain('harassment')
    expect(stored).not.toContain('must not be able to store')
  })

  it('refuses a free-text reason on a message report', async () => {
    const res = await post({
      matrixRoomId: room,
      matrixEventId: '$reported',
      reason: 'they wrote "…" to me',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json.code).toBe('InvalidReason')
    expect(await db.getModerationEvents(author.did, community)).toHaveLength(0)
  })

  it('refuses a claimed DID that does not match the event sender', async () => {
    const res = await post({
      matrixRoomId: room,
      matrixEventId: '$reported',
      reason: 'spam',
      reportedDid: 'did:plc:framed',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json.code).toBe('ReportedDidMismatch')
    expect(
      await db.getModerationEvents('did:plc:framed', community),
    ).toHaveLength(0)
  })

  it('answers 404 for an event the bridge has not seen', async () => {
    const res = await post({
      matrixRoomId: room,
      matrixEventId: '$unknown',
      reason: 'spam',
    })
    expect(res.statusCode).toBe(404)
    expect(res.json.code).toBe('EventNotFound')
  })

  it('requires the room on a message report', async () => {
    const res = await post({ matrixEventId: '$reported', reason: 'spam' })
    expect(res.statusCode).toBe(400)
  })

  it('keeps member reports, which name the DID and carry no event', async () => {
    const res = await post({ reportedDid: author.did, reason: 'spam' })
    expect(res.statusCode).toBe(200)
    expect(await db.getModerationEvents(author.did, community)).toHaveLength(1)
  })

  describe('GET /api/moderation-reports', () => {
    const moderator = 'did:plc:moderator'
    const secondReporter = 'did:plc:second-reporter'

    async function get(modDid: string) {
      const res = new Response()
      const params = new URLSearchParams({ community, modDid })
      await apiModerationReportsHandler(
        getRequest(`/api/moderation-reports?${params}`),
        res as unknown as ServerResponse,
        ctx,
      )
      return res
    }

    beforeEach(async () => {
      await db.setCommunityMembership(moderator, community, 'active', [
        'moderator',
      ])
      await db.setCommunityMembership(secondReporter, community, 'active', [])
      // Two people report the same message, one of them twice.
      for (const [who, reason] of [
        [reporter, 'harassment'],
        [secondReporter, 'harassment'],
        [secondReporter, 'spam'],
      ] as const) {
        auth.did = who
        const res = await post({
          reporterDid: who,
          matrixRoomId: room,
          matrixEventId: '$reported',
          reason,
        })
        expect(res.statusCode).toBe(200)
      }
      auth.did = reporter
      expect(
        (await post({ reportedDid: author.did, reason: 'spam' })).statusCode,
      ).toBe(200)
    })

    it('groups reports by message for a moderator, without reporter identities', async () => {
      auth.did = moderator
      const res = await get(moderator)
      expect(res.statusCode).toBe(200)
      const { reports } = res.json
      expect(reports).toHaveLength(2)

      const message = reports.find(
        (r: { matrixEventId: string | null }) =>
          r.matrixEventId === '$reported',
      )
      expect(message).toMatchObject({
        reportedDid: author.did,
        matrixRoomId: room,
        reportCount: 3,
        reporterCount: 2,
        reasons: { harassment: 2, spam: 1 },
      })
      const member = reports.find(
        (r: { matrixEventId: string | null }) => r.matrixEventId === null,
      )
      expect(member).toMatchObject({ reportedDid: author.did, reportCount: 1 })
      // ISO-8601 UTC from both drivers, so every client parses it the same.
      for (const group of reports) {
        expect(group.lastReportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
      }

      expect(res.text).not.toContain(reporter)
      expect(res.text).not.toContain(secondReporter)
    })

    it('refuses a member who is not a moderator', async () => {
      auth.did = reporter
      const res = await get(reporter)
      expect(res.statusCode).toBe(403)
    })

    it('refuses naming another moderator', async () => {
      auth.did = reporter
      const res = await get(moderator)
      expect(res.statusCode).toBe(403)
    })
  })
})
