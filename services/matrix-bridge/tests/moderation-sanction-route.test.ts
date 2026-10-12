import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PassThrough } from 'node:stream'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatModerationEngine } from '../src/chat-moderation.js'
import type { IBridgeDatabase } from '../src/db/interface.js'
import { PgBridgeDatabase } from '../src/db/pg/index.js'
import { SqliteBridgeDatabase } from '../src/db/sqlite-wrapper.js'
import type * as M8Auth from '../src/m8-auth.js'
import type { RouteContext } from '../src/routes/context.js'
import {
  apiChatMemberListHandler,
  apiModerationDismissHandler,
  apiModerationLiftHandler,
  apiModerationReportHandler,
  apiModerationReportsHandler,
  apiModerationSanctionHandler,
  apiUserChatPreferencesGETHandler,
} from '../src/routes/moderation.js'

// The authenticated caller; each test switches it.
const auth = vi.hoisted(() => ({ did: 'did:plc:moderator' }))
vi.mock('../src/m8-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof M8Auth>()),
  authenticateM8: async () => ({ did: auth.did }),
}))

const owner = 'did:plc:owner'
const moderator = 'did:plc:moderator'
const otherModerator = 'did:plc:moderator-two'
const member = 'did:plc:member'
const bystander = 'did:plc:bystander'
const community = 'at://did:plc:creator/com.para.community.board/one'
const room = '!main:para'
const memberMxid = '@member:para'
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

function postRequest(url: string, body: unknown): IncomingMessage {
  const req = new PassThrough() as unknown as IncomingMessage
  req.headers = {}
  req.url = url
  req.method = 'POST'
  ;(req as unknown as PassThrough).end(JSON.stringify(body))
  return req
}

function getRequest(url: string): IncomingMessage {
  const req = new PassThrough() as unknown as IncomingMessage
  req.headers = {}
  req.url = url
  req.method = 'GET'
  ;(req as unknown as PassThrough).end()
  return req
}

/*
 * Sanctions: who may sanction whom, what a moderator is told about whether it
 * took effect, lifting, dismissing reports, and who may see risk labels. The
 * same suite runs against Postgres when MATRIX_TEST_DATABASE_URL is set.
 */
describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s: moderation sanctions', (driver) => {
  let db: IBridgeDatabase
  let admin: pg.Pool | undefined
  let schema: string
  let ctx: RouteContext
  let matrix: {
    banUser: ReturnType<typeof vi.fn>
    muteUser: ReturnType<typeof vi.fn>
    unbanUser: ReturnType<typeof vi.fn>
  }
  let projection: { applyMemberRoles: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    auth.did = moderator
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
    matrix = {
      banUser: vi.fn(async () => {}),
      muteUser: vi.fn(async () => {}),
      unbanUser: vi.fn(async () => {}),
    }
    projection = { applyMemberRoles: vi.fn(async () => {}) }
    ctx = {
      db,
      firehose: { refreshMembership: async () => {} },
      config: { port: 3001 },
      chatMod: new ChatModerationEngine(db, log),
      matrix,
      projection,
      log,
    } as unknown as RouteContext

    await db.setSpaceForCommunity(community, room, 'one')
    await db.setCommunityMembership(owner, community, 'active', ['owner'])
    await db.setCommunityMembership(moderator, community, 'active', [
      'moderator',
    ])
    await db.setCommunityMembership(otherModerator, community, 'active', [
      'moderator',
    ])
    await db.setCommunityMembership(member, community, 'active', [])
    await db.setCommunityMembership(bystander, community, 'active', [])
    await db.ensureParticipationStats(member, community)
    await db.ensureParticipationStats(bystander, community)
    const now = new Date().toISOString()
    await db.createDeviceSession({
      id: randomUUID(),
      did: member,
      mxid: memberMxid,
      deviceId: 'DEVMEMBER',
      friendlyName: null,
      userAgent: null,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    })
  })

  afterEach(async () => {
    await db.close()
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
    }
  })

  async function sanction(body: Record<string, unknown>, as = moderator) {
    auth.did = as
    const res = new Response()
    await apiModerationSanctionHandler(
      postRequest('/api/moderation-sanction', {
        targetDid: member,
        sanctionedByDid: as,
        communityUri: community,
        type: 'mute',
        durationMinutes: 60,
        ...body,
      }),
      res as unknown as ServerResponse,
      ctx,
    )
    return res
  }

  async function lift(body: Record<string, unknown> = {}, as = moderator) {
    auth.did = as
    const res = new Response()
    await apiModerationLiftHandler(
      postRequest('/api/moderation-sanction-lift', {
        targetDid: member,
        communityUri: community,
        ...body,
      }),
      res as unknown as ServerResponse,
      ctx,
    )
    return res
  }

  describe('POST /api/moderation-sanction', () => {
    it('mutes, records the reason, and says it took effect', async () => {
      const res = await sanction({ reason: '  doxxing a neighbour ' })
      expect(res.statusCode).toBe(200)
      expect(matrix.muteUser).toHaveBeenCalledWith(room, memberMxid)
      expect(res.json.enforcement).toMatchObject({
        status: 'applied',
        accounts: 1,
        failed: 0,
      })
      expect(res.json.sanction).toMatchObject({ type: 'mute' })
      expect(res.json.sanction.until).toBeTruthy()

      const stored = await ctx.chatMod.getSanction(member, community)
      expect(stored).toMatchObject({
        type: 'mute',
        reason: 'doxxing a neighbour',
        byDid: moderator,
      })
    })

    it('bans permanently when no duration is given', async () => {
      const res = await sanction({ type: 'ban', durationMinutes: undefined })
      expect(res.statusCode).toBe(200)
      expect(matrix.banUser).toHaveBeenCalledWith(room, memberMxid)
      expect(res.json.sanction.until).toBeNull()
    })

    it('records the sanction but does not claim success when Matrix refuses', async () => {
      matrix.muteUser.mockRejectedValue(new Error('M_FORBIDDEN'))
      const res = await sanction({})
      expect(res.statusCode).toBe(200)
      expect(res.json.enforcement).toMatchObject({
        status: 'failed',
        applied: 0,
        failed: 1,
      })
      // Recorded anyway, so the projection enforces it at the next interaction.
      expect(await ctx.chatMod.getSanction(member, community)).not.toBeNull()
    })

    it('says "pending" for a member the bridge has no chat account for', async () => {
      await db.setCommunityMembership(bystander, community, 'active', [])
      const res = await sanction({ targetDid: bystander })
      expect(res.statusCode).toBe(200)
      expect(res.json.enforcement).toMatchObject({
        status: 'pending',
        accounts: 0,
      })
      expect(matrix.muteUser).not.toHaveBeenCalled()
      expect(await ctx.chatMod.getSanction(bystander, community)).toMatchObject(
        {
          type: 'mute',
        },
      )
    })

    it.each([
      ['an unknown type', { type: 'redact' }, 'InvalidSanctionType'],
      ['a zero duration', { durationMinutes: 0 }, 'InvalidDuration'],
      ['a fractional duration', { durationMinutes: 1.5 }, 'InvalidDuration'],
      ['a negative duration', { durationMinutes: -5 }, 'InvalidDuration'],
      [
        'a duration over a year',
        { durationMinutes: 600_000 },
        'InvalidDuration',
      ],
      ['a non-numeric duration', { durationMinutes: '60' }, 'InvalidDuration'],
      ['an over-long reason', { reason: 'x'.repeat(501) }, 'InvalidReason'],
    ])('refuses %s', async (_label, body, code) => {
      const res = await sanction(body)
      expect(res.statusCode).toBe(400)
      expect(res.json.code).toBe(code)
      expect(await ctx.chatMod.getSanction(member, community)).toBeNull()
      expect(matrix.muteUser).not.toHaveBeenCalled()
    })

    it('refuses a caller who is not a moderator', async () => {
      const res = await sanction({}, bystander)
      expect(res.statusCode).toBe(403)
      expect(await ctx.chatMod.getSanction(member, community)).toBeNull()
    })

    it('refuses naming another moderator as the sanctioner', async () => {
      auth.did = bystander
      const res = await sanction({ sanctionedByDid: moderator }, bystander)
      expect(res.statusCode).toBe(403)
    })

    describe('who can be sanctioned', () => {
      it('not yourself', async () => {
        const res = await sanction({ targetDid: moderator })
        expect(res.statusCode).toBe(400)
        expect(res.json.code).toBe('SelfSanction')
      })

      it('not an owner, even by another owner or a moderator', async () => {
        const res = await sanction({ targetDid: owner })
        expect(res.statusCode).toBe(403)
        expect(res.json.code).toBe('CannotSanctionOwner')
      })

      it('not a moderator, by a moderator', async () => {
        const res = await sanction({ targetDid: otherModerator })
        expect(res.statusCode).toBe(403)
        expect(res.json.code).toBe('CannotSanctionModerator')
        expect(
          await ctx.chatMod.getSanction(otherModerator, community),
        ).toBeNull()
      })

      it('a moderator, by an owner', async () => {
        const res = await sanction({ targetDid: otherModerator }, owner)
        expect(res.statusCode).toBe(200)
      })
    })
  })

  describe('POST /api/moderation-sanction-lift', () => {
    it('ends a mute and restores the member through their roles', async () => {
      await sanction({})
      const res = await lift({ type: 'mute' })
      expect(res.statusCode).toBe(200)
      expect(res.json.lifted).toBe(true)
      expect(await ctx.chatMod.getSanction(member, community)).toBeNull()
      // Roles are re-projected, not a flat 0: observers must stay read-only.
      expect(projection.applyMemberRoles).toHaveBeenCalledWith(
        expect.objectContaining({ communityUri: community }),
        member,
        expect.objectContaining({ roles: [] }),
      )
    })

    it('unbans the member in Matrix', async () => {
      await sanction({ type: 'ban', durationMinutes: undefined })
      const res = await lift({ type: 'ban' })
      expect(res.json.lifted).toBe(true)
      expect(matrix.unbanUser).toHaveBeenCalledWith(room, memberMxid)
      expect(await ctx.chatMod.getSanction(member, community)).toBeNull()
    })

    it('lifts both when no type is named', async () => {
      await sanction({ type: 'mute' })
      await sanction({ type: 'ban', durationMinutes: undefined })
      const res = await lift()
      expect(res.json.lifted).toBe(true)
      expect(await ctx.chatMod.getSanction(member, community)).toBeNull()
    })

    it('can be repeated to retry Matrix after a failed lift', async () => {
      await sanction({ type: 'ban', durationMinutes: undefined })
      matrix.unbanUser.mockRejectedValueOnce(new Error('homeserver down'))
      const first = await lift({ type: 'ban' })
      expect(first.json.enforcement.status).toBe('failed')

      const retry = await lift({ type: 'ban' })
      expect(retry.statusCode).toBe(200)
      // Already recorded as lifted, but Matrix is tried again.
      expect(retry.json.lifted).toBe(false)
      expect(retry.json.enforcement.status).toBe('applied')
      expect(matrix.unbanUser).toHaveBeenCalledTimes(2)
    })

    it('refuses a caller who is not a moderator', async () => {
      await sanction({})
      const res = await lift({}, bystander)
      expect(res.statusCode).toBe(403)
      expect(await ctx.chatMod.getSanction(member, community)).not.toBeNull()
    })
  })

  describe('reports', () => {
    const reportAs = async (
      reporter: string,
      body: Record<string, unknown>,
    ) => {
      auth.did = reporter
      const res = new Response()
      await apiModerationReportHandler(
        postRequest('/api/moderation-report', {
          reporterDid: reporter,
          communityUri: community,
          reportedDid: member,
          reason: 'spam',
          ...body,
        }),
        res as unknown as ServerResponse,
        ctx,
      )
      return res
    }

    it('accepts the member reasons the app offers, including "abuse"', async () => {
      expect((await reportAs(bystander, { reason: 'abuse' })).statusCode).toBe(
        200,
      )
    })

    it('refuses free text as a member-report reason', async () => {
      const res = await reportAs(bystander, {
        reason: 'they said "…" to me in private',
      })
      expect(res.statusCode).toBe(400)
      expect(res.json.code).toBe('InvalidReason')
    })

    it('counts one account once, however often it reports', async () => {
      for (let i = 0; i < 8; i++) await reportAs(bystander, {})
      auth.did = moderator
      const res = new Response()
      await apiModerationReportsHandler(
        getRequest(
          `/api/moderation-reports?${new URLSearchParams({ community, modDid: moderator })}`,
        ),
        res as unknown as ServerResponse,
        ctx,
      )
      expect(res.json.reports).toHaveLength(1)
      expect(res.json.reports[0]).toMatchObject({
        reportCount: 1,
        reporterCount: 1,
      })
    })

    it('lets a moderator dismiss a report out of the queue', async () => {
      await reportAs(bystander, {})
      auth.did = moderator
      const dismiss = new Response()
      await apiModerationDismissHandler(
        postRequest('/api/moderation-report-dismiss', {
          reportedDid: member,
          communityUri: community,
        }),
        dismiss as unknown as ServerResponse,
        ctx,
      )
      expect(dismiss.statusCode).toBe(200)
      expect(await ctx.chatMod.listReports(community)).toHaveLength(0)
    })

    it('does not let an ordinary member dismiss reports', async () => {
      await reportAs(bystander, {})
      auth.did = bystander
      const dismiss = new Response()
      await apiModerationDismissHandler(
        postRequest('/api/moderation-report-dismiss', {
          reportedDid: member,
          communityUri: community,
        }),
        dismiss as unknown as ServerResponse,
        ctx,
      )
      expect(dismiss.statusCode).toBe(403)
      expect(await ctx.chatMod.listReports(community)).toHaveLength(1)
    })
  })

  describe('GET /api/chat-member-list', () => {
    async function list(as: string) {
      auth.did = as
      const res = new Response()
      await apiChatMemberListHandler(
        getRequest(
          `/api/chat-member-list?${new URLSearchParams({ community })}`,
        ),
        res as unknown as ServerResponse,
        ctx,
      )
      return res.json.members as {
        did: string
        badges: { type: string }[]
        sanction?: unknown
      }[]
    }

    beforeEach(async () => {
      await sanction({ type: 'mute', durationMinutes: 60 })
    })

    it("does not give an ordinary member anyone else's sanction or risk label", async () => {
      const entry = (await list(bystander)).find((m) => m.did === member)!
      expect(entry.badges.map((b) => b.type)).not.toContain('sanctioned')
      expect(entry.sanction).toBeUndefined()
    })

    it('gives a member their own', async () => {
      const entry = (await list(member)).find((m) => m.did === member)!
      expect(entry.badges.map((b) => b.type)).toContain('sanctioned')
    })

    it('gives a moderator everything, with the sanction', async () => {
      const entry = (await list(moderator)).find((m) => m.did === member)!
      expect(entry.badges.map((b) => b.type)).toContain('sanctioned')
      expect(entry.sanction).toMatchObject({ type: 'mute' })
    })
  })

  describe('GET /api/user-chat-preferences', () => {
    async function read(as: string, did: string) {
      auth.did = as
      const res = new Response()
      await apiUserChatPreferencesGETHandler(
        getRequest(
          `/api/user-chat-preferences?${new URLSearchParams({ did })}`,
        ),
        res as unknown as ServerResponse,
        ctx,
      )
      return res
    }

    it('answers for yourself', async () => {
      expect((await read(member, member)).statusCode).toBe(200)
    })

    it("does not answer for someone else's DID", async () => {
      expect((await read(bystander, member)).statusCode).toBe(403)
    })
  })
})
