// @ts-nocheck
import { SeedClient, TestNetwork, basicSeed } from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'

const V2_OVERRIDE_HEADER = 'x-bsky-search-v2-override'

describe('appview search v2', () => {
  let network: TestNetwork
  let agent: ReturnType<TestNetwork['bsky']['getAgent']>
  let sc: SeedClient
  let alice: DidString
  let bob: DidString

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'bsky_views_search_v_two',
      bsky: {
        searchTagsHide: new Set(),
        searchTagsHideAll: new Set(),
        searchV2OverrideHeader: 'true',
      },
    })
    agent = network.bsky.getAgent()
    sc = network.getSeedClient()
    await basicSeed(sc)

    alice = sc.dids.alice
    bob = sc.dids.bob

    // Ensure there is another user with a matching term so that author/mention
    // filters are actually exercised (not just coincidentally correct).
    await sc.post(bob, 'doggo from bob')
    await sc.post(alice, `@${sc.accounts[bob].handle} doggo`, [
      {
        index: { byteStart: 0, byteEnd: sc.accounts[bob].handle.length + 1 },
        features: [
          {
            $type: 'app.bsky.richtext.facet#mention',
            did: bob,
          },
        ],
      },
    ])
    await sc.post(
      alice,
      'doggo en español',
      undefined,
      undefined,
      undefined,
      {
        langs: ['es-ES'],
      },
    )
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  const v2Headers = async (did: DidString) => {
    const headers = await network.serviceHeaders(
      did,
      'app.bsky.feed.searchPosts',
    )
    return { ...headers, [V2_OVERRIDE_HEADER]: 'true' }
  }

  it('forwards author filter to data-plane search v2', async () => {
    const res = await agent.app.bsky.feed.searchPosts(
      { q: 'doggo', author: sc.accounts[alice].handle },
      { headers: await v2Headers(alice) },
    )
    expect(res.data.posts.length).toBeGreaterThan(0)
    expect(
      res.data.posts.every((p) => p.author.did === alice),
    ).toBe(true)
  })

  it('forwards mentions filter to data-plane search v2', async () => {
    const res = await agent.app.bsky.feed.searchPosts(
      { q: 'doggo', mentions: sc.accounts[bob].handle },
      { headers: await v2Headers(alice) },
    )
    expect(res.data.posts.length).toBe(1)
    expect(res.data.posts[0].author.did).toBe(alice)
  })

  it('forwards lang filter to data-plane search v2', async () => {
    const res = await agent.app.bsky.feed.searchPosts(
      { q: 'doggo', lang: 'es' },
      { headers: await v2Headers(alice) },
    )
    expect(res.data.posts.length).toBe(1)
    expect(res.data.posts[0].author.did).toBe(alice)
    expect(res.data.posts[0].record.text).toContain('español')
  })
})
