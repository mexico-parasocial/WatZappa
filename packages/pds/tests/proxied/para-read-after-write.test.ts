import { request } from 'undici'
import { AtpAgent } from '@atproto/api'
import { SeedClient, TestNetwork } from '@atproto/dev-env'
import basicSeed from '../seeds/basic.js'

describe('proxy para read after write', () => {
  let network: TestNetwork
  let agent: AtpAgent
  let sc: SeedClient
  let alice: string

  const createParaPost = async (
    text: string,
    reply?: {
      root: { uri: string; cid: string }
      parent: { uri: string; cid: string }
    },
  ) => {
    const { data } = await agent.api.com.atproto.repo.createRecord(
      {
        repo: alice,
        collection: 'com.para.post',
        record: {
          text,
          createdAt: new Date().toISOString(),
          ...(reply ? { reply } : {}),
        },
      },
      { headers: { ...sc.getHeaders(alice) } },
    )
    return data
  }

  const callPara = async (
    nsid: string,
    params: Record<string, string | number | string[] | undefined>,
  ) => {
    const url = new URL(`/xrpc/${nsid}`, agent.dispatchUrl)
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'undefined') continue
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, item)
        }
      } else {
        url.searchParams.set(key, String(value))
      }
    }
    return request(url, { headers: { ...sc.getHeaders(alice) } })
  }

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'proxy_para_read_after_write',
    })
    agent = network.pds.getClient()
    sc = network.getSeedClient()
    await basicSeed(sc, { addModLabels: network.bsky })
    await network.processAll()
    alice = sc.dids.alice
    await network.bsky.sub.destroy()
  })

  afterAll(async () => {
    await network.close()
  })

  it('handles read after write on com.para.feed.getTimeline', async () => {
    const post = await createParaPost('timeline para post')
    const res = await callPara('com.para.feed.getTimeline', { limit: 50 })
    expect(res.statusCode).toBe(200)
    const body = (await res.body.json()) as { feed: { uri: string }[] }
    expect(body.feed.some((item) => item.uri === post.uri)).toBe(true)
    expect(res.headers['atproto-upstream-lag']).toBeDefined()
  })

  it('handles read after write on com.para.feed.getAuthorFeed', async () => {
    const post = await createParaPost('author para post')
    const res = await callPara('com.para.feed.getAuthorFeed', {
      actor: alice,
      limit: 50,
    })
    expect(res.statusCode).toBe(200)
    const body = (await res.body.json()) as { feed: { uri: string }[] }
    expect(body.feed.some((item) => item.uri === post.uri)).toBe(true)
    expect(res.headers['atproto-upstream-lag']).toBeDefined()
  })

  it('handles read after write on com.para.feed.getPosts', async () => {
    const post = await createParaPost('posts para post')
    const res = await callPara('com.para.feed.getPosts', { uris: [post.uri] })
    expect(res.statusCode).toBe(200)
    const body = (await res.body.json()) as { posts: { uri: string }[] }
    expect(body.posts.map((item) => item.uri)).toEqual([post.uri])
    expect(res.headers['atproto-upstream-lag']).toBeDefined()
  })

  it('handles read after write on com.para.feed.getPostThread', async () => {
    const root = await createParaPost('thread root')
    const reply = await createParaPost('thread reply', {
      root: { uri: root.uri, cid: root.cid },
      parent: { uri: root.uri, cid: root.cid },
    })

    const res = await callPara('com.para.feed.getPostThread', {
      uri: root.uri,
    })
    const body = (await res.body.json()) as {
      post: { uri: string }
      replies: { uri: string }[]
    }
    expect(res.statusCode).toBe(200)
    expect(body.post.uri).toEqual(root.uri)
    expect(body.replies.some((item) => item.uri === reply.uri)).toBe(true)
    expect(res.headers['atproto-upstream-lag']).toBeDefined()
  })
})
