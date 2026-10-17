import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IBridgeDatabase } from '../src/db/interface.js'
import { PgBridgeDatabase } from '../src/db/pg/index.js'
import { SqliteBridgeDatabase } from '../src/db/sqlite-wrapper.js'
import { PushReceiptWorker } from '../src/push-receipts.js'

describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s: push delivery', (driver) => {
  let db: IBridgeDatabase
  let admin: pg.Pool | undefined
  let schema: string
  beforeEach(async () => {
    if (driver === 'postgres') {
      const url = new URL(process.env.MATRIX_TEST_DATABASE_URL!)
      admin = new pg.Pool({ connectionString: url.toString() })
      schema = `test_${randomUUID().replaceAll('-', '')}`
      await admin.query(`CREATE SCHEMA ${schema}`)
      url.searchParams.set('options', `-c search_path=${schema}`)
      db = new PgBridgeDatabase(url.toString())
    } else db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as never)
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    await db.close()
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
      admin = undefined
    }
  })
  it('claims once, recovers expired leases, and refuses stale owners', async () => {
    expect(await db.claimPushDelivery('event', 'token', 'first', 0)).toBe(true)
    expect(await db.claimPushDelivery('event', 'token', 'second', 1)).toBe(
      false,
    )
    expect(
      await db.claimPushDelivery('event', 'token', 'second', 300_000),
    ).toBe(true)
    await db.completePushDelivery(
      'event',
      'first',
      'stale-ticket',
      false,
      300_001,
    )
    expect((await db.getPushDelivery('event'))?.state).toBe('sending')
    await db.completePushDelivery('event', 'second', 'ticket', false, 300_002)
    await db.releasePushDelivery('event', 'second')
    expect(await db.getPushDelivery('event')).toMatchObject({
      state: 'submitted',
      receiptId: 'ticket',
      createdAt: 0,
    })
    expect(await db.claimPushDelivery('event', 'token', 'third', 999_999)).toBe(
      false,
    )
  })
  it('rechecks receipts after fifteen minutes and retains unavailable receipts', async () => {
    await db.claimPushDelivery('event', 'token', 'owner', 0)
    await db.completePushDelivery('event', 'owner', 'ticket', false, 0)
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: {} })))
    vi.stubGlobal('fetch', fetch)
    const worker = new PushReceiptWorker(db, pino({ level: 'silent' }))
    await worker.run(899_999)
    expect(fetch).not.toHaveBeenCalled()
    await worker.run(900_000)
    expect(await db.getPendingPushReceipts(900_001)).toEqual([])
    expect((await db.getPushDelivery('event'))?.state).toBe('submitted')
    fetch.mockResolvedValue(
      new Response(JSON.stringify({ data: { ticket: { status: 'ok' } } })),
    )
    await worker.run(960_000)
    expect((await db.getPushDelivery('event'))?.state).toBe('provider_accepted')
  })
  it('records invalid devices and expires unconfirmed tickets without resending', async () => {
    for (const id of ['invalid', 'missing']) {
      await db.claimPushDelivery(id, 'token', 'owner', 0)
      await db.completePushDelivery(id, 'owner', id, false, 0)
    }
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            invalid: {
              status: 'error',
              details: { error: 'DeviceNotRegistered' },
            },
          },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetch)
    const worker = new PushReceiptWorker(db, pino({ level: 'silent' }))
    await worker.run(900_000)
    expect((await db.getPushDelivery('invalid'))?.state).toBe('rejected')
    await worker.run(24 * 3600_000)
    expect((await db.getPushDelivery('missing'))?.state).toBe('failed')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('waits for an in-flight receipt before shutdown closes the database', async () => {
    await db.claimPushDelivery('event', 'token', 'owner', 0)
    await db.completePushDelivery('event', 'owner', 'ticket', false, 0)
    let respond!: (response: Response) => void
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    vi.stubGlobal('fetch', () => {
      started()
      return new Promise<Response>((resolve) => {
        respond = resolve
      })
    })
    const worker = new PushReceiptWorker(db, pino({ level: 'silent' }))
    const running = worker.run(900_000)
    await entered
    let stopped = false
    const stopping = worker.stop().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    respond(
      new Response(JSON.stringify({ data: { ticket: { status: 'ok' } } })),
    )
    await running
    await stopping
    expect((await db.getPushDelivery('event'))?.state).toBe('provider_accepted')
  })
})

it('preserves an accepted ticket across reopening the SQLite database', async () => {
  const root = mkdtempSync(join(tmpdir(), 'para-push-persistence-'))
  const config = { dbPath: join(root, 'bridge.sqlite') } as never
  let db = new SqliteBridgeDatabase(config)
  try {
    await db.claimPushDelivery('event', 'token', 'owner', 0)
    await db.completePushDelivery('event', 'owner', 'ticket', false, 0)
    await db.close()
    db = new SqliteBridgeDatabase(config)
    expect(
      await db.claimPushDelivery('event', 'token', 'after-restart', 999_999),
    ).toBe(false)
    expect((await db.getPushDelivery('event'))?.receiptId).toBe('ticket')
  } finally {
    await db.close()
    rmSync(root, { recursive: true, force: true })
  }
})
