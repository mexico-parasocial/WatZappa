// @ts-nocheck
import { RecordRef, SeedClient, TestNetwork } from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'

describe('com.para.feed.searchPosts', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: DidString
  let bob: DidString

  let policyPost: RecordRef
  let budgetPost: RecordRef

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'bsky_views_para_feed_search',
    })
    sc = network.getSeedClient()

    await sc.createAccount('alice', {
      email: 'alice@test.com',
      handle: 'alice.test',
      password: 'alice-pass',
    })
    await sc.createAccount('bob', {
      email: 'bob@test.com',
      handle: 'bob.test',
      password: 'bob-pass',
    })

    alice = sc.dids.alice
    bob = sc.dids.bob

    policyPost = await createParaPost(alice, {
      text: 'climate policy para',
      createdAt: new Date().toISOString(),
      tags: ['climate'],
      postType: 'policy',
      party: 'green',
      verifiedPublicFigure: true,
      state: 'CA',
      langs: ['en-US'],
    })
    budgetPost = await createParaPost(bob, {
      text: 'local budget para',
      createdAt: new Date().toISOString(),
      tags: ['budget'],
      postType: 'matter',
      party: 'blue',
      verifiedPublicFigure: false,
      state: 'TX',
      langs: ['es-ES'],
    })

    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  const paraSearch = async (
    params: Record<string, string | string[] | undefined>,
    viewer: DidString,
  ) => {
    const url = new URL(`${network.bsky.url}/xrpc/com.para.feed.searchPosts`)
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, item)
        }
      } else {
        url.searchParams.set(key, value)
      }
    }
    const headers = await network.serviceHeaders(
      viewer,
      'com.para.feed.searchPosts',
    )
    const res = await fetch(url, { headers })
    if (!res.ok) {
      throw new Error(`para search failed: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as { posts: { uri: string }[]; cursor?: string }
  }

  it('forwards PARA-specific filters to the data-plane', async () => {
    const byPostType = await paraSearch(
      { q: 'para', postType: 'policy' },
      alice,
    )
    expect(byPostType.posts.map((p) => p.uri)).toEqual([policyPost.uriStr])

    const byParty = await paraSearch({ q: 'para', party: 'blue' }, alice)
    expect(byParty.posts.map((p) => p.uri)).toEqual([budgetPost.uriStr])

    const byTag = await paraSearch({ q: 'para', tag: ['climate'] }, alice)
    expect(byTag.posts.map((p) => p.uri)).toEqual([policyPost.uriStr])

    const byVerified = await paraSearch(
      { q: 'para', verifiedPublicFigure: 'true' },
      alice,
    )
    expect(byVerified.posts.map((p) => p.uri)).toEqual([policyPost.uriStr])

    const byState = await paraSearch({ q: 'para', state: 'TX' }, alice)
    expect(byState.posts.map((p) => p.uri)).toEqual([budgetPost.uriStr])
  })

  it('forwards upstream filters (author, mentions, lang) to the data-plane', async () => {
    const byAuthor = await paraSearch(
      { q: 'para', author: sc.accounts[alice].handle },
      alice,
    )
    expect(byAuthor.posts.map((p) => p.uri)).toEqual([policyPost.uriStr])

    const mentionPost = await createParaPost(alice, {
      text: `@${sc.accounts[bob].handle} para mention`,
      createdAt: new Date().toISOString(),
      tags: ['mention'],
      postType: 'matter',
      party: 'green',
      state: 'CA',
      langs: ['en-US'],
    })
    await network.processAll()

    const byMentions = await paraSearch(
      { q: 'para', mentions: sc.accounts[bob].handle },
      alice,
    )
    expect(byMentions.posts.map((p) => p.uri)).toEqual([mentionPost.uriStr])

    const byLang = await paraSearch({ q: 'para', lang: 'es' }, alice)
    expect(byLang.posts.map((p) => p.uri)).toEqual([budgetPost.uriStr])
  })

  const createParaPost = async (by: DidString, record: object) => {
    const res = await sc.agent.com.atproto.repo.createRecord(
      { repo: by, collection: 'com.para.post', record },
      { headers: sc.getHeaders(by) },
    )
    return new RecordRef(res.data.uri, res.data.cid)
  }
})
