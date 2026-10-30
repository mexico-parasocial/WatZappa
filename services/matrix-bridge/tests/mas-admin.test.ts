import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MasAdminClient } from '../src/mas-admin.js'

const USER = '01K3ZQD8N7P0J5R2T9V4W6X8YB'
const ONE = '01K3ZQD8N7P0J5R2T9V4W6X8YC'
const OTHER = '01K3ZQD8N7P0J5R2T9V4W6X8YD'
const TWO = '01K3ZQD8N7P0J5R2T9V4W6X8YE'
const COMPAT = '01K3ZQD8N7P0J5R2T9V4W6X8YF'
const localpart = 'a'.repeat(32)
const mxid = `@${localpart}:matrix.test`

describe('MAS authoritative device revocation', () => {
  let server: Server
  let client: MasAdminClient
  let finished: string[]
  let tokenRequests: number
  let wrongOwner: boolean
  let oversized: boolean
  let rejectTokenOnce: boolean
  let requests: string[]
  beforeEach(async () => {
    finished = []
    requests = []
    tokenRequests = 0
    wrongOwner = oversized = rejectTokenOnce = false
    const oauth = (id: string, device: string, modern = false) => ({
      id,
      type: 'oauth2-sessions',
      attributes: {
        user_id: wrongOwner && id === TWO ? OTHER : USER,
        scope: `openid urn:matrix:${modern ? 'client' : 'org.matrix.msc2967.client'}:device:${device}`,
        finished_at: null,
      },
    })
    server = createServer(async (req, res) => {
      const url = new URL(req.url!, 'http://fixture')
      res.setHeader('content-type', 'application/json')
      if (url.pathname === '/oauth2/token') {
        tokenRequests++
        expect(req.headers.authorization).toBe(
          `Basic ${Buffer.from('fixture-client:fixture-secret').toString('base64')}`,
        )
        let body = ''
        for await (const chunk of req) body += chunk
        expect(new URLSearchParams(body).get('scope')).toBe('urn:mas:admin')
        res.end(
          JSON.stringify({
            access_token: 'fixture-service-access-token-123456',
            expires_in: 300,
          }),
        )
        return
      }
      requests.push(url.pathname)
      expect(req.headers.authorization).toBe(
        'Bearer fixture-service-access-token-123456',
      )
      if (rejectTokenOnce) {
        rejectTokenOnce = false
        res.writeHead(401)
        res.end('{}')
        return
      }
      if (url.pathname.startsWith('/api/admin/v1/users/by-username/')) {
        res.end(
          JSON.stringify({
            data: { id: USER, attributes: { username: localpart } },
            padding: oversized ? 'x'.repeat(140000) : '',
          }),
        )
      } else if (url.pathname.endsWith('/finish')) {
        finished.push(
          url.pathname.replace('/api/admin/v1/', '').replace('/finish', ''),
        )
        res.end(
          JSON.stringify({
            data: { attributes: { finished_at: new Date().toISOString() } },
          }),
        )
      } else if (url.pathname === '/api/admin/v1/oauth2-sessions') {
        expect(url.searchParams.get('filter[user]')).toBe(USER)
        expect(url.searchParams.get('filter[status]')).toBe('active')
        if (url.searchParams.has('page[after]')) {
          expect(url.searchParams.get('page[after]')).toBe(OTHER)
          res.end(
            JSON.stringify({
              data: [oauth(TWO, 'TARGET', true)],
              links: { next: null },
            }),
          )
        } else {
          res.end(
            JSON.stringify({
              data: [oauth(ONE, 'TARGET'), oauth(OTHER, 'TARGET-extra')],
              links: {
                next: 'https://attacker.invalid/steal-administrative-token',
              },
            }),
          )
        }
      } else if (url.pathname === '/api/admin/v1/compat-sessions') {
        res.end(
          JSON.stringify({
            data: [
              {
                id: COMPAT,
                attributes: {
                  user_id: USER,
                  device_id: 'TARGET',
                  finished_at: null,
                },
              },
            ],
            links: { next: null },
          }),
        )
      } else {
        res.writeHead(404)
        res.end('{}')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    client = new MasAdminClient({
      adminUrl: origin,
      tokenUrl: `${origin}/oauth2/token`,
      clientId: 'fixture-client',
      clientSecret: 'fixture-secret',
      serverName: 'matrix.test',
    })
  })
  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('finishes all matching OAuth/compat sessions across pages without following response URLs', async () => {
    await client.revokeDevice(mxid, 'TARGET')
    expect(finished).toEqual([
      `oauth2-sessions/${ONE}`,
      `oauth2-sessions/${TWO}`,
      `compat-sessions/${COMPAT}`,
    ])
    expect(tokenRequests).toBe(1)
    expect(requests.every((path) => path.startsWith('/api/admin/v1/'))).toBe(
      true,
    )
  })
  it('checks every owner before performing any revocation', async () => {
    wrongOwner = true
    await expect(client.revokeDevice(mxid, 'TARGET')).rejects.toThrow(
      'owner mismatch',
    )
    expect(finished).toEqual([])
  })
  it('bounds remote JSON responses', async () => {
    oversized = true
    await expect(client.revokeDevice(mxid, 'TARGET')).rejects.toThrow(
      'exceeds limit',
    )
    expect(finished).toEqual([])
  })
  it('renews an expired administrative token once', async () => {
    rejectTokenOnce = true
    await client.revokeDevice(mxid, 'TARGET')
    expect(tokenRequests).toBe(2)
    expect(finished).toHaveLength(3)
  })
  it('refuses foreign homeserver identities before sending credentials', async () => {
    await expect(
      client.revokeDevice(`@${localpart}:other.test`, 'TARGET'),
    ).rejects.toThrow('Invalid MAS device')
    expect(tokenRequests).toBe(0)
  })
})
