import { once } from 'node:events'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createAuthorityResolver } from './community-authority.js'
import type { Config } from './config.js'

const token = 'test-authority-service-token-32-characters'
const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
async function appview(body: unknown, status = 200) {
  const requests: Array<{ url: string; token: string | string[] | undefined }> =
    []
  const server = createServer((req, res) => {
    requests.push({
      url: req.url ?? '',
      token: req.headers['x-para-authority-service-token'],
    })
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No server address')
  return {
    resolver: createAuthorityResolver({
      authorityAppviewUrl: `http://127.0.0.1:${address.port}`,
      authorityServiceToken: token,
    } as Config),
    requests,
  }
}
const response = (roles: string[]) => ({
  roles,
  authorization: { policy: 'verified_authority_service' },
})
describe('verified authority client', () => {
  it('requests the exact member with the scoped credential', async () => {
    const { resolver, requests } = await appview(
      response(['member', 'moderator']),
    )
    expect(
      await resolver(
        'at://did:plc:owner/com.para.community.board/one',
        'did:plc:member',
      ),
    ).toEqual({ state: 'active', roles: ['member', 'moderator'] })
    const url = new URL(requests[0].url, 'http://localhost')
    expect(url.searchParams.get('subject')).toBe('did:plc:member')
    expect(url.searchParams.get('community')).toBe(
      'at://did:plc:owner/com.para.community.board/one',
    )
    expect(requests[0].token).toBe(token)
  })
  it('treats empty verified roles as no active membership', async () => {
    const { resolver } = await appview(response([]))
    expect(await resolver('community', 'did:plc:member')).toEqual({
      state: 'removed',
      roles: [],
    })
  })
  it.each(['delegate', 'observer', 'admin'])(
    'rejects unsupported privileged role %s',
    async (role) => {
      const { resolver } = await appview(response(['member', role]))
      await expect(resolver('community', 'did:plc:member')).rejects.toThrow(
        'Invalid verified community authority',
      )
    },
  )
  it('rejects an older AppView that ignores the service credential', async () => {
    const { resolver } = await appview({
      roles: [],
      authorization: { policy: 'authentication_required' },
    })
    await expect(resolver('community', 'did:plc:member')).rejects.toThrow(
      'Invalid verified community authority',
    )
  })
  it('rejects an outage without retaining privileges', async () => {
    const { resolver } = await appview({}, 503)
    await expect(resolver('community', 'did:plc:member')).rejects.toThrow(
      'unavailable',
    )
  })
  it('bounds decoded responses', async () => {
    const { resolver } = await appview({ data: 'x'.repeat(17000) })
    await expect(resolver('community', 'did:plc:member')).rejects.toThrow(
      'too large',
    )
  })
  it('refuses missing credentials and credentials sent over non-loopback HTTP', () => {
    expect(() => createAuthorityResolver({} as Config)).toThrow('required')
    expect(() =>
      createAuthorityResolver({
        authorityAppviewUrl: 'http://appview.example',
        authorityServiceToken: token,
      } as Config),
    ).toThrow('HTTPS')
  })
})
