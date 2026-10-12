import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import pino from 'pino'
import { afterEach, expect, it, vi } from 'vitest'
import type { RouteContext } from '../routes/context.js'
import { matrixPushV1NotifyHandler } from '../routes/push.js'

afterEach(() => vi.unstubAllGlobals())
async function notify(notification: unknown) {
  const ctx = {
    db: {
      getCommunityByRoomId: async () => ({
        communityUri: 'at://community',
        slug: 'Community',
      }),
    },
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
