import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BridgeDatabase } from '../db/sqlite/index.js'
import { SqliteBridgeDatabase } from '../db/sqlite-wrapper.js'
import { EventBus } from '../events/bus.js'
import { ingestMatrixEvents } from '../matrix-ingestion.js'
import { appServiceTransactionHandler } from '../routes/appservice-txn.js'
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

  beforeEach(async () => {
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
    await wrapped.setSpaceForCommunity(
      'at://test/community/one',
      '!r:para',
      'one',
    )
    await wrapped.setMxidForDid('did:plc:a', '@did-plc-a:para', '')
  })

  afterEach(async () => {
    await wrapped.close()
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

  it('rejects a wrong hs_token with 403', async () => {
    const r = await call(ctx, 'POST', '1.txn', txn('!r:para', '$e1'), {
      token: 'wrong',
    })
    expect(r.status).toBe(403)
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
          origin_server_ts: 1,
        },
        {
          event_id: '$b',
          room_id: '!r:para',
          sender: '@x:para',
          type: 'm.room.message',
          origin_server_ts: 1,
        },
        {
          event_id: '$c',
          room_id: '!r:para',
          sender: '@x:para',
          type: 'm.room.member',
          origin_server_ts: 1,
        },
      ],
    }
    const r = await call(ctx, 'POST', '2.txn', body)
    expect(r.status).toBe(200)
    const unread = received.filter((e) => e.type === 'chat.unread')
    expect(unread).toHaveLength(1)
    expect(unread[0].payload).toMatchObject({
      roomId: '!r:para',
      invalidated: true,
    })
  })

  it('rejects malformed bodies with 400 and stays retryable', async () => {
    const bad = await call(ctx, 'PUT', '3.txn', 'not-json-at-all')
    expect(bad.status).toBe(400)
    // Parse fails before dedup, so Synapse may retry — also 400 until the
    // body is valid (no ack-and-drop of unprocessed events).
    const retry = await call(ctx, 'PUT', '3.txn', 'not-json-at-all')
    expect(retry.status).toBe(400)
  })
  it('rolls back metadata, participation, outbox and txn ID on failure, then retries', async () => {
    using broken = vi
      .spyOn(wrapped, 'appendEvent')
      .mockRejectedValueOnce(new Error('disk full'))
    await expect(
      call(ctx, 'PUT', 'retry', txn('!r:para', '$retry')),
    ).rejects.toThrow('disk full')
    expect(await wrapped.eventExists('$retry')).toBe(false)
    expect(
      await wrapped.getParticipationStats(
        'did:plc:a',
        'at://test/community/one',
      ),
    ).toBeUndefined()
    expect(await wrapped.getMaxEventSeq()).toBe(0)
    expect(received).toHaveLength(0)
    expect(
      (await call(ctx, 'PUT', 'retry', txn('!r:para', '$retry'))).status,
    ).toBe(200)
    expect(
      (
        await wrapped.getParticipationStats(
          'did:plc:a',
          'at://test/community/one',
        )
      ).message_count,
    ).toBe(1)
  })

  it('deduplicates concurrent appservice and poller ingestion, including effects', async () => {
    await Promise.all([
      call(ctx, 'PUT', 'race', txn('!r:para', '$race')),
      ingestMatrixEvents(
        wrapped,
        [
          {
            eventId: '$race',
            roomId: '!r:para',
            sender: '@did-plc-a:para',
            type: 'm.room.message',
            originServerTs: 1,
          },
        ],
        bus,
      ),
    ])
    expect(
      (
        await wrapped.getParticipationStats(
          'did:plc:a',
          'at://test/community/one',
        )
      ).message_count,
    ).toBe(1)
    expect(await wrapped.listEventsAfter(0, 10)).toHaveLength(1)
  })

  it('does not persist or broadcast metadata from unknown rooms', async () => {
    await call(ctx, 'PUT', 'unknown', txn('!private:para', '$secret'))
    expect(await wrapped.eventExists('$secret')).toBe(false)
    expect(received).toHaveLength(0)
  })

  it('rejects malformed and oversized events without recording their transactions', async () => {
    expect((await call(ctx, 'PUT', 'bad', { events: [null] })).status).toBe(400)
    expect(
      (
        await call(ctx, 'PUT', 'large', {
          events: [],
          padding: 'x'.repeat(4 * 1024 * 1024),
        })
      ).status,
    ).toBe(413)
    expect(
      (await call(ctx, 'PUT', 'bad', txn('!r:para', '$fixed'))).status,
    ).toBe(200)
  })
})
