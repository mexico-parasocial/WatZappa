import { jest } from '@jest/globals'
import { type SeedClient, TestNetworkNoAppView } from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'
import type { AppContext } from '../src/index.js'

/*
 * PARA's own PDS methods (src/api/com/para) and the community write rules the
 * generic repo methods enforce.
 */
describe('PARA PDS methods', () => {
  let network: TestNetworkNoAppView
  let ctx: AppContext
  let sc: SeedClient
  let alice: string
  let bob: string

  const M8_URL = 'https://m8.para.invalid'

  const xrpc = async (
    nsid: string,
    {
      did,
      params,
      body,
      headers,
    }: {
      did?: string
      params?: Record<string, string>
      body?: unknown
      headers?: Record<string, string>
    } = {},
  ) => {
    const url = new URL(`/xrpc/${nsid}`, network.pds.url)
    for (const [k, v] of Object.entries(params ?? {})) {
      url.searchParams.set(k, v)
    }
    const res = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(did ? sc.getHeaders(did as DidString) : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as Record<string, any>
    return { status: res.status, body: json }
  }

  const createRecord = (did: string, collection: string, record: object) =>
    xrpc('com.atproto.repo.createRecord', {
      did,
      body: { repo: did, collection, record },
    })

  beforeAll(async () => {
    network = await TestNetworkNoAppView.create({
      dbPostgresSchema: 'para_pds',
    })
    ctx = network.pds.ctx
    sc = network.getSeedClient()
    await sc.createAccount('alice', {
      handle: 'alice.test',
      email: 'alice@test.com',
      password: 'alice-pass',
    })
    await sc.createAccount('bob', {
      handle: 'bob.test',
      email: 'bob@test.com',
      password: 'bob-pass',
    })
    alice = sc.dids.alice
    bob = sc.dids.bob
  })

  afterAll(async () => {
    await network.close()
  })

  describe('readiness', () => {
    it('reports the database check', async () => {
      const res = await fetch(new URL('/xrpc/_ready', network.pds.url))
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ ready: true })
    })
  })

  describe('iM8 auth factor', () => {
    const login = (authFactorToken?: string) =>
      xrpc('com.atproto.server.createSession', {
        body: {
          identifier: 'bob.test',
          password: 'bob-pass',
          authFactorToken,
        },
      })

    afterEach(() => {
      ctx.cfg.m8BaseUrl = null
    })

    it('is off by default', async () => {
      const res = await xrpc('com.para.account.getAuthFactor', { did: bob })
      expect(res.status).toBe(200)
      expect(res.body.authFactorType).toBeUndefined()
    })

    it('refuses unsupported factor types', async () => {
      const res = await xrpc('com.para.account.setAuthFactor', {
        did: bob,
        body: { authFactorType: 'sms' },
      })
      expect(res.status).toBe(400)
    })

    it('requires a token for the same DID once enabled', async () => {
      const set = await xrpc('com.para.account.setAuthFactor', {
        did: bob,
        body: { authFactorType: 'im8' },
      })
      expect(set.body.authFactorType).toBe('im8')

      const missing = await login()
      expect(missing.status).toBe(401)
      expect(missing.body.error).toBe('AuthFactorTokenRequired')

      // No broker configured: fail closed.
      const unconfigured = await login('m8-token')
      expect(unconfigured.body.error).toBe('AuthFactorTokenRequired')

      ctx.cfg.m8BaseUrl = M8_URL
      const realFetch = globalThis.fetch
      using _ = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input, init) => {
          const url = String(input instanceof Request ? input.url : input)
          if (!url.startsWith(M8_URL)) return realFetch(input, init)
          const token = new Headers(init?.headers).get('authorization')
          const did = token === 'Bearer bob-token' ? bob : alice
          return Response.json({ session: { did } })
        })

      const wrongDid = await login('alice-token')
      expect(wrongDid.body.error).toBe('AuthFactorTokenRequired')

      const ok = await login('bob-token')
      expect(ok.status).toBe(200)
      expect(ok.body.did).toBe(bob)
    })

    it('turns off when the type is omitted', async () => {
      const res = await xrpc('com.para.account.setAuthFactor', {
        did: bob,
        body: {},
      })
      expect(res.body.authFactorType).toBeUndefined()
      expect((await login()).status).toBe(200)
    })
  })

  describe('communities', () => {
    let community: string
    let communityUri: string
    let profileCid: string

    const act = (did: string, input: object) =>
      xrpc('com.para.community.act', {
        did,
        body: { community, ...input },
      })

    it('founds a community account with its profile and first event', async () => {
      const res = await xrpc('com.para.community.create', {
        did: alice,
        body: {
          name: 'Agua Limpia',
          slug: 'agua-limpia',
          quadrant: 'norte',
          region: 'Jalisco',
        },
      })
      expect(res.status).toBe(200)
      community = res.body.did
      communityUri = res.body.uri
      profileCid = res.body.cid
      expect(communityUri).toBe(
        `at://${community}/com.para.community.profile/self`,
      )

      const profile = await xrpc('com.atproto.repo.getRecord', {
        params: {
          repo: community,
          collection: 'com.para.community.profile',
          rkey: 'self',
        },
      })
      expect(profile.body.value).toMatchObject({
        name: 'Agua Limpia',
        region: 'Jalisco',
      })

      const events = await xrpc('com.atproto.repo.listRecords', {
        params: { repo: community, collection: 'com.para.community.event' },
      })
      expect(events.body.records).toHaveLength(1)
      expect(events.body.records[0].value).toMatchObject({
        seq: 1,
        action: 'community.found',
        actor: alice,
      })
    })

    it('joins and leaves a community through act', async () => {
      const joined = await act(bob, { action: 'member.join' })
      expect(joined.status).toBe(200)
      expect(joined.body.seq).toBe(2)
      expect((await act(bob, { action: 'member.join' })).body.error).toBe(
        'InvalidSubject',
      )
      const left = await act(bob, { action: 'member.leave' })
      expect(left.status).toBe(200)
    })

    it('does not let the last owner leave', async () => {
      const res = await act(alice, { action: 'member.leave' })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('LastOwner')
    })

    it('shares content only as an active member', async () => {
      const post = await createRecord(alice, 'app.bsky.feed.post', {
        text: 'agua',
        createdAt: new Date().toISOString(),
      })
      const share = (did: string) =>
        xrpc('com.para.community.shareContent', {
          did,
          body: {
            communityUri,
            subject: { uri: post.body.uri, cid: post.body.cid },
            contentType: 'post',
          },
        })

      // bob left above.
      expect((await share(bob)).body.error).toBe('CommunityMembershipRequired')
      const shared = await share(alice)
      expect(shared.status).toBe(200)
      expect(shared.body.sharedContent.sharedBy).toBe(alice)
      expect((await share(alice)).body.error).toBe('DuplicateSharedContent')
    })

    it('names a community only by its account profile', async () => {
      const res = await xrpc('com.para.community.shareContent', {
        did: alice,
        body: {
          communityUri: `at://${alice}/com.para.community.board/3kxyz`,
          subject: { uri: communityUri, cid: profileCid },
          contentType: 'post',
        },
      })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/community account profile/)
    })
  })

  describe('retired community records', () => {
    it.each([
      'com.para.community.board',
      'com.para.community.membership',
      'com.para.community.governance',
      'com.para.community.roleAcceptance',
      'com.para.community.authorityEvent',
      'com.para.community.relation',
      'com.para.community.sharedContentAction',
    ])('refuses a new %s record', async (collection) => {
      const res = await xrpc('com.atproto.repo.createRecord', {
        did: alice,
        body: {
          repo: alice,
          collection,
          record: { $type: collection, createdAt: new Date().toISOString() },
        },
      })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('LegacyCommunityRecord')
    })
  })

  describe('alpha rollout', () => {
    it('lists the rollout states without auth', async () => {
      const res = await xrpc('com.para.alpha.getRolloutStatus')
      expect(res.status).toBe(200)
      expect(res.body.states).toEqual([])
    })

    it('creates invites only with the admin token', async () => {
      const asUser = await xrpc('com.para.alpha.createInvite', {
        did: alice,
        body: { state: 'JAL' },
      })
      expect(asUser.status).toBe(401)

      const asAdmin = await xrpc('com.para.alpha.createInvite', {
        body: { state: 'jal', count: 2 },
        headers: network.pds.adminAuthHeaders(),
      })
      expect(asAdmin.status).toBe(200)
      expect(asAdmin.body.state).toBe('JAL')
      expect(asAdmin.body.codes).toHaveLength(2)

      const before = await xrpc('com.para.alpha.getAccess', { did: alice })
      expect(before.body.hasAccess).toBe(false)

      const redeemed = await xrpc('com.para.alpha.requestAccess', {
        did: alice,
        body: { state: 'JAL', inviteCode: asAdmin.body.codes[0] },
      })
      expect(redeemed.body.status).toBe('approved')

      const after = await xrpc('com.para.alpha.getAccess', { did: alice })
      expect(after.body).toMatchObject({ hasAccess: true, state: 'JAL' })
    })
  })
})
