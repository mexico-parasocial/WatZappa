import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { PassThrough } from 'node:stream'
import { BridgeDatabase } from '../db/sqlite/index.js'
import { SqliteBridgeDatabase } from '../db/sqlite-wrapper.js'
import { appServiceTransactionHandler } from '../routes/appservice-txn.js'
import { EventBus } from '../events/bus.js'
import type { RouteContext } from '../routes/context.js'

const HS = 'test-hs-token'
const silentLog = {
  warn: () => {},
  info: () => {},
  error: () => {},
  debug: () => {},
}

function fakeCtx(db: SqliteBridgeDatabase, events: EventBus): RouteContext {
  return {
    config: { port: 3001, matrixHsToken: HS } as RouteContext['config'],
    db,
    events,
    metrics: undefined as never,
    log: silentLog as never,
    // recordMessage path: avoid chat-moderation engine; handler tolerates it
    chatMod: { recordMessage: async () => {} } as never,
  } as unknown as RouteContext
}

async function call(
  ctx: RouteContext,
  method: 'POST' | 'PUT',
  txnId: string,
  body: unknown,
  opts: { token?: string | null } = {},
): Promise<{ status: number; json: any }> {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  const req = new PassThrough() as unknown as IncomingMessage & {
    write(c: Buffer): boolean
    end(): void
  }
  req.method = method
  req.url = `/_matrix/app/unstable/transactions/${txnId}?access_token=${opts.token ?? HS}`
  req.headers = { 'content-length': String(payload.length) }
  const res = {
    statusCode: 0,
    headersSent: false,
    writeHead(code: number) {
      this.statusCode = code
      this.headersSent = true
    },
    end(chunk?: any) {
      if (!this.statusCode) this.statusCode = 200
      this.json = chunk ? JSON.parse(chunk) : {}
    },
  } as {
    statusCode: number
    headersSent: boolean
    writeHead(n: number): void
    end(c?: unknown): void
    json?: any
  } as unknown as ServerResponse
  const p = appServiceTransactionHandler(req, res, ctx)
  // write/end (not emit): a paused PassThrough buffers these for the async
  // iterator the handler attaches.
  req.write(Buffer.from(payload))
  req.end()
  await p
  return { status: res.statusCode, json: (res as { json?: any }).json }
}

describe('appservice transaction endpoint', () => {
  let db: BridgeDatabase
  let wrapped: SqliteBridgeDatabase
  let dbPath: string
  let ctx: RouteContext
  let bus: EventBus
  const received: Array<{ type: string; payload: any }> = []

  beforeEach(() => {
    received.length = 0
    dbPath = path.join(
      os.tmpdir(),
      `para-bridge-as-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    db = new BridgeDatabase({ dbPath } as any)
    wrapped = new SqliteBridgeDatabase({ dbPath } as any)
    bus = new EventBus(wrapped, silentLog as any)
    bus.subscribe((e) => received.push({ type: e.type, payload: e.payload }))
    ctx = fakeCtx(wrapped, bus)
  })

  afterEach(() => {
    wrapped.close()
    db.close()
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // ignore
    }
  })

  const txn = (roomId: string, eventId: string) => ({
    events: [
      {
        event_id: eventId,
        room_id: roomId,
        sender: '@did-plc-a:para',
        type: 'm.room.message',
        origin_server_ts: 1,
      },
    ],
  })

  it('rejects a wrong hs_token with 401', async () => {
    const r = await call(ctx, 'POST', '1.txn', txn('!r:para', '$e1'), {
      token: 'wrong',
    })
    expect(r.status).toBe(401)
  })

  it('returns 403 when hs_token is not configured', async () => {
    const bare = { ...ctx, config: { port: 3001 } }
    const r = await call(
      bare as RouteContext,
      'POST',
      '1.txn',
      txn('!r:para', '$e1'),
    )
    expect(r.status).toBe(403)
  })

  it('accepts a transaction once and dedups retries', async () => {
    const first = await call(ctx, 'POST', '1.txn', txn('!r:para', '$e1'))
    expect(first.status).toBe(200)
    const retry = await call(ctx, 'POST', '1.txn', txn('!r:para', '$e1'))
    expect(retry.status).toBe(200)
    // Event ingested exactly once despite the retry.
    const stored = await wrapped.getRecentEvents('!r:para', 10)
    expect(stored.filter((e: any) => e.event_id === '$e1')).toHaveLength(1)
  })

  it('publishes one aggregate chat.unread per room per transaction', async () => {
    const body = {
      events: [
        {
          event_id: '$a',
          room_id: '!r:para',
          sender: '@x:para',
          type: 'm.room.message',
        },
        {
          event_id: '$b',
          room_id: '!r:para',
          sender: '@x:para',
          type: 'm.room.message',
        },
        {
          event_id: '$c',
          room_id: '!r:para',
          sender: '@x:para',
          type: 'm.room.member',
        },
      ],
    }
    const r = await call(ctx, 'POST', '2.txn', body)
    expect(r.status).toBe(200)
    const unread = received.filter((e) => e.type === 'chat.unread')
    expect(unread).toHaveLength(1)
    expect(unread[0].payload).toMatchObject({ roomId: '!r:para', count: 2 })
  })

  it('rejects malformed bodies with 400 and stays retryable', async () => {
    const bad = await call(ctx, 'PUT', '3.txn', 'not-json-at-all')
    expect(bad.status).toBe(400)
    // Parse fails before dedup, so Synapse may retry — also 400 until the
    // body is valid (no ack-and-drop of unprocessed events).
    const retry = await call(ctx, 'PUT', '3.txn', 'not-json-at-all')
    expect(retry.status).toBe(400)
  })
})
