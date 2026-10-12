import { randomUUID } from 'node:crypto'
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
import { BRIDGE_AUDIENCES, mxidForIdentityPub } from '../src/identity-proof.js'
import type * as M8Auth from '../src/m8-auth.js'
import type { RouteContext, RouteHandler } from '../src/routes/context.js'
import {
  DM_REQUEST_MAX_PENDING,
  DM_REQUEST_TTL_MS,
  apiDmRequestAcceptHandler,
  apiDmRequestCreateHandler,
  apiDmRequestDeclineHandler,
  apiDmRequestListHandler,
} from '../src/routes/dm-requests.js'

// The authenticated caller; each test switches between requester and recipient.
const auth = vi.hoisted(() => ({ did: 'did:plc:alice' }))
vi.mock('../src/m8-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof M8Auth>()),
  authenticateM8: async () => ({ did: auth.did }),
}))

const alice = 'did:plc:alice'
const bob = 'did:plc:bob'
const carol = 'did:plc:carol'
const serverName = 'matrix.example'
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

function request(method: string, body?: unknown): IncomingMessage {
  const req = new PassThrough() as unknown as IncomingMessage
  req.headers = {}
  req.method = method
  ;(req as unknown as PassThrough).end(
    body === undefined ? undefined : JSON.stringify(body),
  )
  return req
}

/*
 * Matrix DMs by consent: the requester proves its MXID (audience dm.v1) and
 * only the recipient, on acceptance, ever receives it.
 */
describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s: /api/dm-requests', (driver) => {
  let db: IBridgeDatabase
  let admin: pg.Pool | undefined
  let schema: string
  let ctx: RouteContext
  const created: string[] = []
  const identity = deriveIdentity(new Uint8Array(32).fill(7), 'public')
  const aliceMxid = mxidForIdentityPub(identity.pub, serverName)

  beforeEach(async () => {
    created.length = 0
    auth.did = alice
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
      config: { port: 3001, matrixServerName: serverName },
      challenges: new ChallengeStore(),
      matrix: {
        userExists: async () => false,
        createUser: async (mxid: string) => {
          created.push(mxid)
        },
      },
      projection: { reconcileMemberAccess: async () => {} },
      log,
    } as unknown as RouteContext
  })

  afterEach(async () => {
    vi.useRealTimers()
    await db.close()
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
      admin = undefined
    }
  })

  async function invoke(handler: RouteHandler, method: string, body?: unknown) {
    const res = new Response()
    await handler(request(method, body), res as unknown as ServerResponse, ctx)
    return res
  }

  function proof(audience: string = BRIDGE_AUDIENCES.dm) {
    const challenge = ctx.challenges.issue(auth.did).challenge
    return signAssertion(identity, {
      purpose: 'matrix-login',
      audience,
      challenge,
    })
  }

  async function aliceAsksBob() {
    auth.did = alice
    return invoke(apiDmRequestCreateHandler, 'POST', {
      recipientDid: bob,
      assertion: proof(),
    })
  }

  it('lets the recipient accept and hands it the requester MXID exactly once', async () => {
    const asked = await aliceAsksBob()
    expect(asked.statusCode).toBe(201)
    expect(created).toEqual([aliceMxid])

    auth.did = bob
    const listed = await invoke(apiDmRequestListHandler, 'GET')
    expect(listed.json.incoming).toEqual([
      expect.objectContaining({ id: asked.json.id, requesterDid: alice }),
    ])

    const accepted = await invoke(apiDmRequestAcceptHandler, 'POST', {
      id: asked.json.id,
    })
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json).toEqual({
      requesterDid: alice,
      requesterMxid: aliceMxid,
    })

    const again = await invoke(apiDmRequestAcceptHandler, 'POST', {
      id: asked.json.id,
    })
    expect(again.statusCode).toBe(404)
    expect(
      (await invoke(apiDmRequestListHandler, 'GET')).json.incoming,
    ).toEqual([])
  })

  it('shows the requester its accepted request, without the MXID, until dismissed', async () => {
    const asked = await aliceAsksBob()
    auth.did = bob
    await invoke(apiDmRequestAcceptHandler, 'POST', { id: asked.json.id })

    auth.did = alice
    const mine = await invoke(apiDmRequestListHandler, 'GET')
    expect(mine.json.outgoing).toEqual([
      expect.objectContaining({
        id: asked.json.id,
        recipientDid: bob,
        status: 'accepted',
      }),
    ])
    expect(mine.text).not.toContain(aliceMxid)

    const dismissed = await invoke(apiDmRequestDeclineHandler, 'POST', {
      id: asked.json.id,
    })
    expect(dismissed.statusCode).toBe(200)
    expect(
      (await invoke(apiDmRequestListHandler, 'GET')).json.outgoing,
    ).toEqual([])
  })

  it('asking again after an acceptance is a new pending request', async () => {
    const first = await aliceAsksBob()
    auth.did = bob
    await invoke(apiDmRequestAcceptHandler, 'POST', { id: first.json.id })

    const second = await aliceAsksBob()
    expect(second.statusCode).toBe(201)
    expect(second.json.id).not.toBe(first.json.id)
    auth.did = bob
    const listed = await invoke(apiDmRequestListHandler, 'GET')
    expect(listed.json.incoming).toEqual([
      expect.objectContaining({ id: second.json.id }),
    ])
    const accepted = await invoke(apiDmRequestAcceptHandler, 'POST', {
      id: second.json.id,
    })
    expect(accepted.json.requesterMxid).toBe(aliceMxid)
  })

  it('does not count accepted requests against the pending cap', async () => {
    const asked = await aliceAsksBob()
    auth.did = bob
    await invoke(apiDmRequestAcceptHandler, 'POST', { id: asked.json.id })
    auth.did = alice
    expect(
      await db.countPendingDmRequestsFrom(alice, new Date().toISOString()),
    ).toBe(0)
  })

  it('accepts the assertion at the top level, as the PARA client sends it', async () => {
    const signed = proof()
    const res = await invoke(apiDmRequestCreateHandler, 'POST', {
      recipientDid: bob,
      ...signed,
    })
    expect(res.statusCode).toBe(201)
  })

  it('never puts an MXID in a listing, for either party', async () => {
    await aliceAsksBob()
    for (const did of [alice, bob]) {
      auth.did = did
      const listed = await invoke(apiDmRequestListHandler, 'GET')
      expect(listed.text).not.toContain(aliceMxid)
      expect(listed.text).not.toContain('Mxid')
    }
    auth.did = alice
    const mine = await invoke(apiDmRequestListHandler, 'GET')
    expect(mine.json.outgoing).toEqual([
      expect.objectContaining({ recipientDid: bob }),
    ])
  })

  it('refuses a proof made for another purpose', async () => {
    const res = await invoke(apiDmRequestCreateHandler, 'POST', {
      recipientDid: bob,
      assertion: proof(BRIDGE_AUDIENCES.identity),
    })
    expect(res.statusCode).toBe(401)
    auth.did = bob
    expect(
      (await invoke(apiDmRequestListHandler, 'GET')).json.incoming,
    ).toEqual([])
  })

  it('refuses a reused challenge', async () => {
    const assertion = proof()
    const first = await invoke(apiDmRequestCreateHandler, 'POST', {
      recipientDid: bob,
      assertion,
    })
    expect(first.statusCode).toBe(201)
    const replay = await invoke(apiDmRequestCreateHandler, 'POST', {
      recipientDid: carol,
      assertion,
    })
    expect(replay.statusCode).toBe(401)
  })

  it('refuses requests to yourself and to non-DIDs', async () => {
    const self = await invoke(apiDmRequestCreateHandler, 'POST', {
      recipientDid: alice,
      assertion: proof(),
    })
    expect(self.statusCode).toBe(400)
    const bad = await invoke(apiDmRequestCreateHandler, 'POST', {
      recipientDid: 'alice.example',
      assertion: proof(),
    })
    expect(bad.statusCode).toBe(400)
  })

  it('keeps one request per pair and refreshes it instead of duplicating', async () => {
    const first = await aliceAsksBob()
    const second = await aliceAsksBob()
    expect(second.statusCode).toBe(200)
    expect(second.json.id).toBe(first.json.id)
    auth.did = bob
    expect(
      (await invoke(apiDmRequestListHandler, 'GET')).json.incoming,
    ).toHaveLength(1)
  })

  it('lets only the recipient accept', async () => {
    const asked = await aliceAsksBob()
    for (const did of [alice, carol]) {
      auth.did = did
      const res = await invoke(apiDmRequestAcceptHandler, 'POST', {
        id: asked.json.id,
      })
      expect(res.statusCode).toBe(404)
    }
  })

  it('lets the recipient decline and the requester cancel, returning nothing', async () => {
    const asked = await aliceAsksBob()
    auth.did = carol
    expect(
      (await invoke(apiDmRequestDeclineHandler, 'POST', { id: asked.json.id }))
        .statusCode,
    ).toBe(404)
    auth.did = bob
    const declined = await invoke(apiDmRequestDeclineHandler, 'POST', {
      id: asked.json.id,
    })
    expect(declined.json).toEqual({ removed: true })
    expect(declined.text).not.toContain(aliceMxid)

    const again = await aliceAsksBob()
    auth.did = alice
    const cancelled = await invoke(apiDmRequestDeclineHandler, 'POST', {
      id: again.json.id,
    })
    expect(cancelled.statusCode).toBe(200)
    auth.did = bob
    expect(
      (await invoke(apiDmRequestListHandler, 'GET')).json.incoming,
    ).toEqual([])
  })

  it('caps pending requests per requester', async () => {
    for (let i = 0; i < DM_REQUEST_MAX_PENDING; i++) {
      const res = await invoke(apiDmRequestCreateHandler, 'POST', {
        recipientDid: `did:plc:target${i}`,
        assertion: proof(),
      })
      expect(res.statusCode).toBe(201)
    }
    const over = await invoke(apiDmRequestCreateHandler, 'POST', {
      recipientDid: carol,
      assertion: proof(),
    })
    expect(over.statusCode).toBe(429)
  })

  it('expires requests: neither listed nor acceptable after the TTL', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const asked = await aliceAsksBob()
    vi.setSystemTime(
      new Date(Date.parse('2026-01-01T00:00:00Z') + DM_REQUEST_TTL_MS + 1000),
    )
    auth.did = bob
    expect(
      (await invoke(apiDmRequestListHandler, 'GET')).json.incoming,
    ).toEqual([])
    const accepted = await invoke(apiDmRequestAcceptHandler, 'POST', {
      id: asked.json.id,
    })
    expect(accepted.statusCode).toBe(404)
  })
})
