import type { SeedClient } from '@atproto/dev-env'
import { TestNetworkNoAppView } from '@atproto/dev-env'
import basicSeed from './seeds/basic.js'

describe('tls-check', () => {
  let network: TestNetworkNoAppView
  let sc: SeedClient

  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({
      dbPostgresSchema: 'tls_check',
    })
    sc = network.getSeedClient()
    await basicSeed(sc)
  })

  afterAll(async () => {
    await network.close()
  })

  const check = async (domain?: string) => {
    const url = new URL('/tls-check', network.pds.url)
    if (domain !== undefined) url.searchParams.set('domain', domain)
    const res = await fetch(url)
    return res.status
  }

  it('allows the PDS hostname', async () => {
    expect(await check(network.pds.ctx.cfg.service.hostname)).toBe(200)
  })

  it('allows the handle of an existing account', async () => {
    expect(await check(sc.accounts[sc.dids.alice].handle)).toBe(200)
  })

  it('is case-insensitive', async () => {
    expect(await check(sc.accounts[sc.dids.alice].handle.toUpperCase())).toBe(
      200,
    )
  })

  it('refuses a handle with no account', async () => {
    expect(await check('nobody-here.test')).toBe(404)
  })

  it('refuses names outside the service handle domains', async () => {
    expect(await check('example.com')).toBe(400)
  })

  it('refuses a request without a domain', async () => {
    expect(await check()).toBe(400)
    expect(await check('')).toBe(400)
  })
})
