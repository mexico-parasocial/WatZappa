import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { PassThrough } from 'node:stream'
import pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deriveIdentity,
  signAssertion,
} from '../src/__tests__/helpers/identity.js'
import { ChallengeStore } from '../src/challenge.js'
import type { IBridgeDatabase } from '../src/db/interface.js'
import { PgBridgeDatabase } from '../src/db/pg/index.js'
import { SqliteBridgeDatabase } from '../src/db/sqlite-wrapper.js'
import { EventBus } from '../src/events/bus.js'
import { BRIDGE_AUDIENCES } from '../src/identity-proof.js'
import { ingestMatrixEvents } from '../src/matrix-ingestion.js'
import { MatrixLoginUnavailableError } from '../src/matrix-login-error.js'
import type { RouteContext, RouteHandler } from '../src/routes/context.js'
import { apiEventsSseHandler } from '../src/routes/events.js'
import {
  apiInstitutionMembersPOSTHandler,
  apiInstitutionMembersRevokeHandler,
  apiInstitutionsPOSTHandler,
} from '../src/routes/institutions.js'
import {
  apiMatrixAttestHandler,
  apiMatrixIdentityHandler,
  apiMatrixIdentityGoneHandler,
  apiMatrixTokenHandler,
} from '../src/routes/matrix-identity.js'

vi.mock('../src/m8-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/m8-auth.js')>()),
  authenticateM8: async () => ({ did: 'did:plc:alice' }),
}))
const did = 'did:plc:alice'
const community = 'at://did:plc:creator/com.para.community.board/one'
const log = { warn() {}, info() {} }
const identity = deriveIdentity(
  new Uint8Array(32), // all-zero seed vector
  'public',
)
class Response extends EventEmitter {
  text = ''
  statusCode = 200
  ended = false
  slow = false
  writeHead(status: number) {
    this.statusCode = status
  }
  write(chunk: string) {
    this.text += chunk
    return !this.slow
  }
  end(chunk = '') {
    this.text += chunk
    this.ended = true
  }
}
function request(body?: unknown): IncomingMessage {
  const req = new PassThrough() as unknown as IncomingMessage
  req.headers = {}
  req.url = '/api/events'
  if (body !== undefined)
    (req as unknown as PassThrough).end(JSON.stringify(body))
  return req
}

describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s: resource authorization and durable delivery', (driver) => {
  let db: IBridgeDatabase
  let admin: pg.Pool | undefined
  let schema: string
  let ctx: RouteContext
  const responses: Response[] = []
  beforeEach(async () => {
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
      config: {
        port: 3001,
        matrixPublicHomeserverUrl: 'https://matrix.example',
        matrixServerName: 'matrix.example',
      },
      events: new EventBus(db, log),
      challenges: new ChallengeStore(),
      matrix: { userExists: async () => true },
      log,
    } as unknown as RouteContext
    await db.setSpaceForCommunity(community, '!main:para', 'one', 'bicameral')
    await db.setChamberRooms(community, '!a:para', '!b:para', '!observer:para')
    await db.setCommunityMembership(did, community, 'active', [])
    await db.setChamberAssignment(community, did, 'A')
  })
  afterEach(async () => {
    for (const res of responses.splice(0)) res.emit('close')
    await db.close()
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
    }
  })
  async function connect(res = new Response()) {
    responses.push(res)
    await apiEventsSseHandler(request(), res as unknown as ServerResponse, ctx)
    return res
  }
  async function notice(roomId: string, extra = {}) {
    return ctx.events.publish({
      type: 'chat.unread',
      communityUri: community,
      payload: { roomId, ...extra },
    })
  }
  it('atomically retries failed ingestion and deduplicates both producers', async () => {
    // Attribution flows through minted device sessions post-CD-M1.
    const now = new Date().toISOString()
    await db.createDeviceSession({
      id: randomUUID(),
      did,
      mxid: '@alice:para',
      deviceId: 'DEVTEST',
      friendlyName: null,
      userAgent: null,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    })
    const event = {
      roomId: '!a:para',
      eventId: '$event',
      sender: '@alice:para',
      type: 'm.room.message',
      originServerTs: Date.now(),
    }
    using broken = vi
      .spyOn(db, 'appendEvent')
      .mockRejectedValueOnce(new Error('storage failure'))
    await expect(
      ingestMatrixEvents(db, [event], ctx.events, 'txn'),
    ).rejects.toThrow('storage failure')
    expect(await db.eventExists(event.eventId)).toBe(false)
    expect(await db.getParticipationStats(did, community)).toBeUndefined()
    await Promise.all([
      ingestMatrixEvents(db, [event], ctx.events, 'txn'),
      ingestMatrixEvents(db, [event], ctx.events),
    ])
    expect((await db.getParticipationStats(did, community)).message_count).toBe(
      1,
    )
    expect(await db.listEventsAfter(0, 100)).toHaveLength(1)
  })
  it('replays more than 200 entries including events published during replay', async () => {
    for (let n = 0; n < 405; n++) await notice('!a:para', { n })
    const read = db.listEventsAfter.bind(db)
    using spy = vi
      .spyOn(db, 'listEventsAfter')
      .mockImplementationOnce(async (cursor, limit) => {
        await notice('!a:para', { n: 405 })
        return read(cursor, limit)
      })
    const res = await connect()
    await vi.waitFor(() =>
      expect(res.text.match(/event: chat.unread/g)).toHaveLength(406),
    )
  })
  it('checks room access during replay and after revocation on the same connection', async () => {
    await notice('!a:para', { marker: 'allowed' })
    await notice('!b:para', { marker: 'wrong-chamber' })
    await ctx.events.publish({
      type: 'chat.unread',
      communityUri: community,
      audienceDids: [did],
      payload: { roomId: '!b:para', marker: 'targeted-wrong-chamber' },
    })
    await ctx.events.publish({
      type: 'chat.unread',
      communityUri: null,
      payload: { roomId: '!secret:para' },
    })
    const res = await connect()
    expect(res.text).toContain('allowed')
    expect(res.text).not.toContain('wrong-chamber')
    expect(res.text).not.toContain('!secret:para')
    await db.setCommunityMembership(did, community, 'revoked')
    const event = await notice('!a:para', { marker: 'after-revoke' })
    await vi.waitFor(() =>
      expect(res.text).toContain(
        `event: checkpoint\ndata: {"seq":${event.seq}}`,
      ),
    )
    expect(res.text).not.toContain('after-revoke')
  })
  it('requires resynchronization when retention removed the requested history', async () => {
    const old = await notice('!a:para')
    await notice('!a:para')
    await db.pruneEventsBefore(new Date(Date.now() + 60_000).toISOString())
    const latest = await notice('!a:para', { marker: 'after-retention' })
    const req = request()
    req.headers['last-event-id'] = String(old.seq)
    const res = new Response()
    responses.push(res)
    await apiEventsSseHandler(req, res as unknown as ServerResponse, ctx)
    expect(res.text).toContain('event: resync_required')
    expect(res.text).toContain(`"maxSeq":${latest.seq}`)
    expect(res.text).not.toContain('after-retention')
  })
  it('disconnects consumers that cannot accept writes', async () => {
    const res = new Response()
    res.slow = true
    await connect(res)
    expect(res.ended).toBe(true)
  })
  it('recovers a durable event even if the post-commit wake was missed', async () => {
    await db.appendEvent({
      type: 'chat.unread',
      communityUri: community,
      audienceDids: null,
      payload: { roomId: '!a:para', marker: 'durable' },
    })
    const res = await connect()
    expect(res.text).toContain('durable')
  })

  async function invoke(handler: RouteHandler, body: unknown) {
    const res = new Response()
    await handler(request(body), res as unknown as ServerResponse, ctx)
    return res
  }
  it('does not fabricate a device session when delegated auth rejects appservice login', async () => {
    ctx.matrix = {
      userExists: async () => true,
      appServiceLogin: async () => {
        throw new MatrixLoginUnavailableError()
      },
    } as never
    const challenge = ctx.challenges.issue(did).challenge
    const signed = signAssertion(identity, {
      purpose: 'matrix-login',
      audience: BRIDGE_AUDIENCES.session,
      challenge,
    })
    const res = await invoke(apiMatrixTokenHandler, signed)
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.text).error).toBe('MATRIX_CLIENT_LOGIN_REQUIRED')
    expect(await db.listDeviceSessions(did)).toHaveLength(0)
  })
  it('reports the Matrix identity and login flow without minting a session', async () => {
    ctx.matrix = {
      userExists: async () => true,
      appServiceLogin: async () => {
        throw new Error('must not be called')
      },
    } as never
    const challenge = ctx.challenges.issue(did).challenge
    const signed = signAssertion(identity, {
      purpose: 'matrix-login',
      audience: BRIDGE_AUDIENCES.identity,
      challenge,
    })
    const res = await invoke(apiMatrixIdentityHandler, signed)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.text)
    // Derived from the zero-seed public identity key, pinned in iM8.
    expect(body.userId).toBe('@k4o2lmcmitomgymtdb7y3htsthoofobo:matrix.example')
    expect(body.loginFlow).toBe('oidc')
    // A client needs a resolvable address. The token endpoint used to derive
    // one by rewriting the internal URL, which produced https://synapse.
    expect(body.homeServer).toBe('https://matrix.example')
    // Identity only: nothing was created.
    expect(await db.listDeviceSessions(did)).toHaveLength(0)
    expect(body.accessToken).toBeUndefined()
  })
  it('attests a client-managed MAS session and is idempotent per device', async () => {
    ctx.matrix = { userExists: async () => true } as never
    const challenge = ctx.challenges.issue(did).challenge
    const signed = signAssertion(identity, {
      purpose: 'matrix-login',
      audience: BRIDGE_AUDIENCES.attest,
      challenge,
    })
    const res = await invoke(apiMatrixAttestHandler, {
      ...signed,
      deviceId: 'MASDEVICE1',
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.text)
    expect(body.attested).toBe(true)
    expect(body.userId).toBe('@k4o2lmcmitomgymtdb7y3htsthoofobo:matrix.example')
    const sessions = await db.listDeviceSessions(did)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].deviceId).toBe('MASDEVICE1')

    // Re-attesting the same device reuses the row instead of accumulating.
    const challenge2 = ctx.challenges.issue(did).challenge
    const signed2 = signAssertion(identity, {
      purpose: 'matrix-login',
      audience: BRIDGE_AUDIENCES.attest,
      challenge: challenge2,
    })
    const res2 = await invoke(apiMatrixAttestHandler, {
      ...signed2,
      deviceId: 'MASDEVICE1',
    })
    expect(res2.statusCode).toBe(200)
    expect(JSON.parse(res2.text).sessionId).toBe(body.sessionId)
    expect(await db.listDeviceSessions(did)).toHaveLength(1)
  })

  it('rejects an attestation signed for another audience', async () => {
    const challenge = ctx.challenges.issue(did).challenge
    const signed = signAssertion(identity, {
      purpose: 'matrix-login',
      audience: BRIDGE_AUDIENCES.session,
      challenge,
    })
    const res = await invoke(apiMatrixAttestHandler, {
      ...signed,
      deviceId: 'MASDEVICE1',
    })
    expect(res.statusCode).toBe(401)
    expect(await db.listDeviceSessions(did)).toHaveLength(0)
  })

  it('answers 410 with a migration pointer on the removed GET identity route', async () => {
    const res = await invoke(apiMatrixIdentityGoneHandler, undefined)
    expect(res.statusCode).toBe(410)
    expect(JSON.parse(res.text).migrate.challenge).toBe(
      'POST /api/matrix-challenge',
    )
  })

  it('refuses to report an identity without a proof', async () => {
    // No assertion at all: shape-rejected before anything is derived. The
    // HttpError is what the server's error layer turns into the 400.
    await expect(invoke(apiMatrixIdentityHandler, {})).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(await db.listDeviceSessions(did)).toHaveLength(0)
    // An assertion over an unknown/foreign challenge never verifies.
    const foreign = signAssertion(identity, {
      purpose: 'matrix-login',
      audience: BRIDGE_AUDIENCES.identity,
      challenge: 'f'.repeat(64),
    })
    const res2 = await invoke(apiMatrixIdentityHandler, foreign)
    expect(res2.statusCode).toBe(401)
    expect(await db.listDeviceSessions(did)).toHaveLength(0)
  })
  it('creates a server-chosen institution and refuses arbitrary owner claims', async () => {
    const res = await invoke(apiInstitutionsPOSTHandler, {})
    const { institutionId } = JSON.parse(res.text)
    expect(institutionId).toMatch(/^urn:uuid:/)
    expect((await db.getInstitutionOwners(institutionId)).has(did)).toBe(true)
    await expect(
      invoke(apiInstitutionMembersPOSTHandler, {
        institutionId: 'victim',
        did,
        role: 'owner',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.getInstitutionOwners('victim')).size).toBe(0)
  })
  it('cannot demote, expire, replace or revoke an owner through generic membership endpoints', async () => {
    const { institutionId } = JSON.parse(
      (await invoke(apiInstitutionsPOSTHandler, {})).text,
    )
    for (const role of ['member', 'auditor', 'owner']) {
      await expect(
        invoke(apiInstitutionMembersPOSTHandler, {
          institutionId,
          did,
          role,
          expiresAt: new Date(Date.now() + 1000).toISOString(),
        }),
      ).rejects.toMatchObject({ statusCode: 409 })
    }
    await expect(
      invoke(apiInstitutionMembersRevokeHandler, { institutionId, did }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(
      (await db.getInstitutionOwners(institutionId)).get(did)?.revokedAt,
    ).toBeNull()
  })
  it('serializes concurrent role mutations without removing the last owner', async () => {
    const { institutionId } = JSON.parse(
      (await invoke(apiInstitutionsPOSTHandler, {})).text,
    )
    const results = await Promise.allSettled([
      invoke(apiInstitutionMembersPOSTHandler, {
        institutionId,
        did,
        role: 'auditor',
      }),
      invoke(apiInstitutionMembersRevokeHandler, { institutionId, did }),
      invoke(apiInstitutionMembersPOSTHandler, {
        institutionId,
        did: 'did:plc:bob',
        role: 'member',
        workspaceId: 'work',
      }),
    ])
    expect(results.map((r) => r.status)).toEqual([
      'rejected',
      'rejected',
      'fulfilled',
    ])
    expect((await db.getInstitutionOwners(institutionId)).get(did)?.role).toBe(
      'owner',
    )
  })
})
