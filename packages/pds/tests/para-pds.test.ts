import { jest } from '@jest/globals'
import { type SeedClient, TestNetworkNoAppView } from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'
import type { AppContext } from '../src/index.js'

/*
 * PARA's own PDS methods (src/api/com/para) and the community write rules the
 * generic repo methods enforce. The network has no AppView, so the AppView
 * calls createBoard makes for its name check are stubbed.
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

    // The name check's AppView half: no other community exists.
    jest
      .spyOn(ctx.bskyAppView!.client, 'call')
      .mockResolvedValue({ boards: [], canCreateCommunity: true } as never)
  })

  afterAll(async () => {
    jest.restoreAllMocks()
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
    let boardUri: string

    it('creates a board with its founding records', async () => {
      const res = await xrpc('com.para.community.createBoard', {
        did: alice,
        body: { name: 'Agua Limpia', quadrant: 'norte', region: 'Jalisco' },
      })
      expect(res.status).toBe(200)
      boardUri = res.body.uri
      const rkey = boardUri.split('/').pop()

      const board = await network.pds.ctx.actorStore.read(
        alice as `did:${string}:${string}`,
        (store) => store.record.getRecord(boardUri as never, null),
      )
      expect(board?.value).toMatchObject({
        name: 'Agua Limpia',
        status: 'draft',
        region: 'Jalisco',
      })

      const membership = await xrpc('com.atproto.repo.getRecord', {
        params: {
          repo: alice,
          collection: 'com.para.community.membership',
          rkey: rkey!,
        },
      })
      expect(membership.body.value).toMatchObject({
        membershipState: 'active',
        roles: ['owner', 'moderator'],
      })

      const events = await xrpc('com.atproto.repo.listRecords', {
        params: {
          repo: alice,
          collection: 'com.para.community.authorityEvent',
        },
      })
      expect(events.body.records).toHaveLength(2)
    })

    it('replays an identical request without demoting the board', async () => {
      // Activate the board and add a field createBoard does not manage.
      const rkey = boardUri.split('/').pop()!
      const current = await xrpc('com.atproto.repo.getRecord', {
        params: { repo: alice, collection: 'com.para.community.board', rkey },
      })
      await xrpc('com.atproto.repo.putRecord', {
        did: alice,
        body: {
          repo: alice,
          collection: 'com.para.community.board',
          rkey,
          record: {
            ...current.body.value,
            status: 'active',
            chamberMode: 'bicameral',
          },
        },
      })

      const res = await xrpc('com.para.community.createBoard', {
        did: alice,
        body: { name: 'Agua Limpia', quadrant: 'norte' },
      })
      expect(res.status).toBe(200)
      expect(res.body.uri).toBe(boardUri)

      const after = await xrpc('com.atproto.repo.getRecord', {
        params: { repo: alice, collection: 'com.para.community.board', rkey },
      })
      expect(after.body.value).toMatchObject({
        status: 'active',
        chamberMode: 'bicameral',
        region: 'Jalisco',
      })
    })

    it('refuses a name already used by the creator', async () => {
      const res = await xrpc('com.para.community.createBoard', {
        did: alice,
        body: { name: 'agua limpia', quadrant: 'sur' },
      })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('CommunityNameTaken')
    })

    it('joins and leaves a community', async () => {
      const joined = await xrpc('com.para.community.join', {
        did: bob,
        body: { communityUri: boardUri },
      })
      expect(joined.status).toBe(200)
      expect(joined.body.membershipState).toBe('active')
      expect(joined.body.viewerCapabilities).toContain('leave_community')

      const left = await xrpc('com.para.community.leave', {
        did: bob,
        body: { communityUri: boardUri },
      })
      expect(left.body.membershipState).toBe('left')
    })

    it('does not let the owner leave', async () => {
      const res = await xrpc('com.para.community.leave', {
        did: alice,
        body: { communityUri: boardUri },
      })
      expect(res.body.error).toBe('CommunityOwnerCannotLeave')
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
            communityUri: boardUri,
            subject: { uri: post.body.uri, cid: post.body.cid },
            contentType: 'post',
          },
        })

      expect((await share(bob)).body.error).toBe('CommunityMembershipRequired')
      const shared = await share(alice)
      expect(shared.status).toBe(200)
      expect(shared.body.sharedContent.sharedBy).toBe(alice)
      expect((await share(alice)).body.error).toBe('DuplicateSharedContent')
    })
  })

  describe('authority events', () => {
    const event = (did: string, overrides: object = {}) => ({
      $type: 'com.para.community.authorityEvent',
      community: `at://${did}/com.para.community.board/3kxyz`,
      subject: did,
      action: 'member.activate',
      issuer: did,
      effectiveAt: new Date().toISOString(),
      version: 1,
      basis: 'openAdmission',
      createdAt: new Date().toISOString(),
      ...overrides,
    })

    it('refuses an event issued by someone else', async () => {
      const res = await createRecord(
        alice,
        'com.para.community.authorityEvent',
        event(alice, { issuer: bob }),
      )
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/issuer must match/)
    })

    it('refuses service-generated migration events', async () => {
      const res = await createRecord(
        alice,
        'com.para.community.authorityEvent',
        event(alice, { basis: 'migration' }),
      )
      expect(res.status).toBe(400)
    })

    it('keeps accepted events immutable', async () => {
      const created = await createRecord(
        alice,
        'com.para.community.authorityEvent',
        event(alice),
      )
      expect(created.status).toBe(200)
      const rkey = created.body.uri.split('/').pop()

      const deleted = await xrpc('com.atproto.repo.deleteRecord', {
        did: alice,
        body: {
          repo: alice,
          collection: 'com.para.community.authorityEvent',
          rkey,
        },
      })
      expect(deleted.body.message).toMatch(/immutable/)

      const put = await xrpc('com.atproto.repo.putRecord', {
        did: alice,
        body: {
          repo: alice,
          collection: 'com.para.community.authorityEvent',
          rkey,
          record: event(alice, { version: 2 }),
        },
      })
      expect(put.body.message).toMatch(/immutable/)
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
