import { request } from 'undici'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type SeedClient,
  TestNetwork,
  createParaPost,
  createParaPostMeta,
  likeParaRecord,
  usersSeed,
} from '@atproto/dev-env'
import type { DidString } from '@atproto/syntax'
import { app, com } from '../../src/lexicons/index.js'

describe('Influence', () => {
  let network: TestNetwork
  let sc: SeedClient

  beforeAll(async () => {
    network = await TestNetwork.create({ dbPostgresSchema: 'bsky_influence' })
    sc = network.getSeedClient()
    await usersSeed(sc)
    await sc.agent.com.atproto.repo.putRecord(
      {
        repo: sc.dids.alice,
        collection: app.bsky.actor.profile.$type,
        rkey: 'self',
        record: { displayName: 'Alice', revealInfluence: true },
      },
      { headers: sc.getHeaders(sc.dids.alice) },
    )
    await network.processAll()
  })

  afterAll(async () => network?.close())

  async function read(actor: string, viewer?: DidString) {
    const nsid = com.para.actor.getProfileStats.$lxm
    const url = new URL(`/xrpc/${nsid}`, network.bsky.url)
    url.searchParams.set('actor', actor)
    const res = await request(url, {
      headers: viewer ? await network.serviceHeaders(viewer, nsid) : undefined,
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('private, no-store')
    return com.para.actor.getProfileStats.$output.schema.parse(
      await res.body.json(),
    )
  }

  async function reaction(by: DidString, subject: string, value: number) {
    return sc.agent.com.atproto.repo.createRecord(
      {
        repo: by,
        collection: com.para.civic.openQuestionVote.$type,
        record: { subject, value, createdAt: new Date().toISOString() },
      },
      { headers: sc.getHeaders(by) },
    )
  }

  it('counts actual reactions, handles negative totals, and never trusts metadata', async () => {
    const alice = sc.dids.alice
    const bob = sc.dids.bob
    const carol = sc.dids.carol
    const before = (await read(alice)).stats.influence
    const post = await createParaPost(sc, alice, 'Influence test post')
    await createParaPostMeta(sc, alice, post.uri, {
      postType: 'matter',
      voteScore: 999999,
    })
    await network.processAll()
    expect((await read(alice)).stats.influence).toBe(before)

    const like = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: bob,
        collection: app.bsky.feed.like.$type,
        record: { subject: post, createdAt: new Date().toISOString() },
      },
      { headers: sc.getHeaders(bob) },
    )
    await network.processAll()
    expect((await read(alice)).stats.influence).toBe(before + 1)

    // The signed downvote replaces Bob's legacy like, rather than counting both.
    const down = await reaction(bob, post.uri, -1)
    const carolDown = await reaction(carol, post.uri, -1)
    await network.processAll()
    expect((await read(alice)).stats.influence).toBe(before - 2)

    await reaction(bob, post.uri, 1)
    await network.processAll()
    expect((await read(alice)).stats.influence).toBe(before)
    await reaction(bob, post.uri, 0)
    await network.processAll()
    expect((await read(alice)).stats.influence).toBe(before - 1)

    // Remove the legacy like first, then the signed reaction.
    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: bob,
        collection: app.bsky.feed.like.$type,
        rkey: like.data.uri.split('/').at(-1)!,
      },
      { headers: sc.getHeaders(bob) },
    )
    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: bob,
        collection: com.para.civic.openQuestionVote.$type,
        rkey: down.data.uri.split('/').at(-1)!,
      },
      { headers: sc.getHeaders(bob) },
    )
    await network.processAll()
    expect((await read(alice)).stats.influence).toBe(before - 1)
    await sc.agent.com.atproto.repo.deleteRecord(
      {
        repo: carol,
        collection: com.para.civic.openQuestionVote.$type,
        rkey: carolDown.data.uri.split('/').at(-1)!,
      },
      { headers: sc.getHeaders(carol) },
    )
    await network.processAll()
    expect((await read(alice)).stats.influence).toBe(before)
  })

  it('counts standard posts and proposed questions over the full content history', async () => {
    const alice = sc.dids.alice
    const bob = sc.dids.bob
    const before = (await read(alice)).stats.influence
    const post = await sc.post(alice, 'Standard post Influence')
    await sc.like(bob, post.ref)
    const proposal = await sc.agent.com.atproto.repo.createRecord(
      {
        repo: alice,
        collection: com.para.raq.proposal.$type,
        record: {
          text: 'Influence proposal',
          createdAt: new Date().toISOString(),
        },
      },
      { headers: sc.getHeaders(alice) },
    )
    await sc.agent.com.atproto.repo.createRecord(
      {
        repo: bob,
        collection: com.para.raq.proposalVote.$type,
        record: {
          subject: proposal.data.uri,
          value: -1,
          createdAt: new Date().toISOString(),
        },
      },
      { headers: sc.getHeaders(bob) },
    )
    await network.processAll()
    expect((await read(alice)).stats.influence).toBe(before)
    const bobStats = await read(bob)
    expect(bobStats.stats.votesCastAllTime).toBeGreaterThanOrEqual(2)
  })

  it('withholds a hidden score from other viewers and always lets its owner see it', async () => {
    const alice = sc.dids.alice
    const post = await createParaPost(sc, alice, 'Visibility test post')
    await likeParaRecord(sc, sc.dids.bob, post)
    await likeParaRecord(sc, sc.dids.carol, post)
    await network.processAll()
    const actual = (await read(alice, alice)).stats.influence
    expect(actual).not.toBe(0)
    const setVisibility = async (revealInfluence: boolean) => {
      await sc.agent.com.atproto.repo.putRecord(
        {
          repo: alice,
          collection: app.bsky.actor.profile.$type,
          rkey: 'self',
          record: { displayName: 'Alice', revealInfluence },
        },
        { headers: sc.getHeaders(alice) },
      )
      await network.processAll()
    }
    await setVisibility(false)
    expect(await read(alice)).toMatchObject({
      influenceVisible: false,
      stats: { influence: 0, votesReceivedAllTime: 0 },
    })
    expect((await read(alice, sc.dids.bob)).stats.influence).toBe(0)
    expect((await read(alice, alice)).stats.influence).toBe(actual)
    await setVisibility(true)
    expect(await read(alice)).toMatchObject({
      influenceVisible: true,
      stats: { influence: actual },
    })
  })
})
