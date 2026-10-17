import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import pino from 'pino'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SqliteBridgeDatabase } from '../db/sqlite-wrapper.js'
import type { RouteContext } from '../routes/context.js'
import { matrixPushV1NotifyHandler } from '../routes/push.js'

let db: SqliteBridgeDatabase
beforeEach(() => {
  db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as never)
})
afterEach(async () => {
  vi.unstubAllGlobals()
  await db.close()
})
async function notify(notification: unknown) {
  const ctx = {
    db,
    log: pino({ level: 'silent' }),
  } as unknown as RouteContext
  const server = createServer((req, res) => {
    void matrixPushV1NotifyHandler(req, res, ctx).catch(() => {
      res.writeHead(500)
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = request(
          {
            hostname: '127.0.0.1',
            port: (server.address() as AddressInfo).port,
            path: '/_matrix/push/v1/notify',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => {
            let body = ''
            res.setEncoding('utf8')
            res.on('data', (chunk) => {
              body += chunk
            })
            res.on('end', () => resolve({ status: res.statusCode!, body }))
          },
        )
        req.on('error', reject)
        req.end(JSON.stringify({ notification }))
      },
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
const devices = [{ app_id: 'com.para.app', pushkey: 'ExpoPushToken[test]' }]
it('does not resend an accepted event, including after a partial provider failure', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            { status: 'ok', id: 'receipt' },
            { status: 'error', details: { error: 'MessageRateExceeded' } },
          ],
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ status: 'ok', id: 'receipt-two' }] }),
      ),
    )
  vi.stubGlobal('fetch', fetch)
  const notification = {
    devices: [
      ...devices,
      { app_id: 'com.para.app', pushkey: 'ExpoPushToken[second]' },
    ],
    event_id: '$event',
    room_id: '!room',
  }
  expect((await notify(notification)).status).toBe(502)
  expect((await notify(notification)).status).toBe(200)
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toHaveLength(1)
  expect(JSON.parse(fetch.mock.calls[1][1].body)[0].to).toBe(
    'ExpoPushToken[second]',
  )
  expect((await notify(notification)).status).toBe(200)
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('rejects invalid provider tokens without copying message content to Expo', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }],
      }),
    ),
  )
  vi.stubGlobal('fetch', fetch)
  const response = await notify({
    devices,
    event_id: '$event',
    room_id: '!room',
    content: { body: 'private text' },
    counts: { unread: 3 },
  })
  expect(response.status).toBe(200)
  expect(JSON.parse(response.body)).toEqual({
    rejected: ['ExpoPushToken[test]'],
  })
  const messages = JSON.parse(fetch.mock.calls[0][1].body)
  expect(messages[0].badge).toBe(3)
  expect(messages[0].data.eventId).toBe('$event')
  expect(JSON.stringify(messages)).not.toContain('private text')
})
it('asks Matrix to retry a temporary provider outage', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
  )
  expect(
    (await notify({ devices, event_id: '$event', room_id: '!room' })).status,
  ).toBe(502)
})
it('updates badge counts without a message alert', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: 'ok' }] })),
    )
  vi.stubGlobal('fetch', fetch)
  expect((await notify({ devices, counts: { unread: 0 } })).status).toBe(200)
  const [message] = JSON.parse(fetch.mock.calls[0][1].body)
  expect(message.badge).toBe(0)
  expect(message.body).toBeUndefined()
  expect(message.sound).toBeUndefined()
})
