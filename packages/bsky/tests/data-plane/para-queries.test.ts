import {
  SeedClient,
  TestNetwork,
  createParaCommunityBoard,
  createParaPost,
  createParaPostMeta,
  createParaStatus,
  usersSeed,
  writeParaFixture,
} from '@atproto/dev-env'
import { ids } from '../../src/lexicon/lexicons.js'

describe('para dataplane queries', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: string
  let bob: string
  let carol: string

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'bsky_data_plane_para_queries',
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    alice = sc.dids.alice
    bob = sc.dids.bob
    carol = sc.dids.carol
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
  })

  it('queries para timeline and author feed', async () => {
    const { alicePost, bobPost, carolPost } = await writeParaFixture(
      network,
      async () => {
        await sc.follow(alice, bob)
        const alicePost = await createParaPost(
          sc,
          alice,
          'alice timeline para post',
          {
            flairs: ['|#Sanidad'],
          },
        )
        const bobPost = await createParaPost(
          sc,
          bob,
          'bob timeline para post',
          {
            flairs: ['|#TransportePublico'],
          },
        )
        const carolPost = await createParaPost(
          sc,
          carol,
          'carol timeline para post',
        )
        return { alicePost, bobPost, carolPost }
      },
    )

    const timeline = await network.bsky.ctx.dataplane.getParaTimeline({
      actorDid: alice,
      limit: 50,
    })
    const timelineUris = timeline.items.map((item) => item.uri)
    expect(timelineUris).toContain(alicePost.uri)
    expect(timelineUris).toContain(bobPost.uri)
    expect(timelineUris).not.toContain(carolPost.uri)

    const flairTimeline = await network.bsky.ctx.dataplane.getParaTimeline({
      actorDid: alice,
      limit: 50,
      flairTag: '|#Sanidad',
    })
    const flairTimelineUris = flairTimeline.items.map((item) => item.uri)
    expect(flairTimelineUris).toContain(alicePost.uri)
    expect(flairTimelineUris).not.toContain(bobPost.uri)

    const authorFeed = await network.bsky.ctx.dataplane.getParaAuthorFeed({
      actorDid: bob,
      limit: 50,
    })
    expect(authorFeed.items.some((item) => item.uri === bobPost.uri)).toBe(true)
    expect(authorFeed.items.every((item) => item.author === bob)).toBe(true)

    const flairAuthorFeed = await network.bsky.ctx.dataplane.getParaAuthorFeed({
      actorDid: bob,
      limit: 50,
      flairTag: '|#TransportePublico',
    })
    expect(flairAuthorFeed.items.map((item) => item.uri)).toContain(bobPost.uri)
  })

  it('queries para posts by uri list order', async () => {
    const { first, second } = await writeParaFixture(network, async () => {
      const first = await createParaPost(sc, alice, 'first ordered para post')
      const second = await createParaPost(sc, bob, 'second ordered para post')
      return { first, second }
    })

    const missing = `at://did:example:missing/${ids.ComParaPost}/self`
    const got = await network.bsky.ctx.dataplane.getParaPosts({
      uris: [second.uri, missing, first.uri],
    })
    expect(got.items.map((item) => item.uri)).toEqual([second.uri, first.uri])
  })

  it('queries community posts by board name, normalized name, and slug', async () => {
    const { board, post } = await writeParaFixture(network, async () => {
      const board = await createParaCommunityBoard(sc, alice, 'Morena')
      const post = await createParaPost(
        sc,
        alice,
        'morena community slug post',
        {
          postType: 'policy',
        },
      )
      await createParaPostMeta(sc, alice, post.uri, {
        postType: 'policy',
        voteScore: 1,
        party: 'p/Morena',
        community: board.slug,
      })
      return { board, post }
    })
    await network.bsky.db.db
      .updateTable('para_post')
      .set({ party: 'p/Morena' })
      .where('uri', '=', post.uri)
      .execute()
    const indexedBoard = await network.bsky.db.db
      .selectFrom('para_community_board')
      .select(['name', 'slug'])
      .where('slug', '=', board.slug)
      .executeTakeFirst()
    const indexedMeta = await network.bsky.db.db
      .selectFrom('para_post_meta')
      .select(['postUri', 'community'])
      .where('postUri', '=', post.uri)
      .executeTakeFirst()
    expect(indexedBoard).toMatchObject({ name: 'Morena', slug: board.slug })
    expect(indexedMeta).toMatchObject({
      postUri: post.uri,
      community: board.slug,
    })

    for (const community of ['Morena', 'morena', board.slug]) {
      const res = await network.bsky.ctx.dataplane.getParaCommunityPosts({
        community,
        limit: 50,
      })
      expect(res.items.map((item) => item.uri)).toContain(post.uri)
    }

    const partyTimeline = await network.bsky.ctx.dataplane.getParaTimeline({
      actorDid: alice,
      limit: 50,
      party: 'p/Morena',
    })
    expect(partyTimeline.items.map((item) => item.uri)).toContain(post.uri)
  })

  it('queries para thread with parents and replies', async () => {
    const { root, reply, grandReply } = await writeParaFixture(
      network,
      async () => {
        const root = await createParaPost(sc, alice, 'root para thread post')
        const reply = await createParaPost(sc, bob, 'reply para thread post', {
          root,
          parent: root,
        })
        const grandReply = await createParaPost(
          sc,
          carol,
          'grand reply para post',
          {
            root,
            parent: reply,
          },
        )
        return { root, reply, grandReply }
      },
    )

    const onRoot = await network.bsky.ctx.dataplane.getParaThread({
      postUri: root.uri,
      above: 10,
      below: 10,
    })
    expect(onRoot.post?.uri).toEqual(root.uri)
    expect(onRoot.parents).toEqual([])
    const rootReplyUris = onRoot.replies.map((item) => item.uri)
    expect(rootReplyUris).toContain(reply.uri)
    expect(rootReplyUris).toContain(grandReply.uri)

    const onGrandReply = await network.bsky.ctx.dataplane.getParaThread({
      postUri: grandReply.uri,
      above: 10,
      below: 10,
    })
    expect(onGrandReply.post?.uri).toEqual(grandReply.uri)
    expect(onGrandReply.parents.map((item) => item.uri)).toEqual([
      root.uri,
      reply.uri,
    ])
  })

  it('queries para post meta fallback and explicit metadata', async () => {
    const post = await writeParaFixture(network, async () =>
      createParaPost(sc, alice, 'meta fallback para post', {
        postType: 'policy',
        tags: ['post-tag'],
        flairs: ['post-flair'],
      }),
    )

    const fallback = await network.bsky.ctx.dataplane.getParaPostMeta({
      postUri: post.uri,
    })
    expect(fallback.post?.uri).toEqual(post.uri)
    expect(fallback.post?.postType).toEqual('policy')
    expect(fallback.post?.voteScore).toEqual(0)
    expect(fallback.post?.tags).toEqual(['post-tag'])
    expect(fallback.post?.flairs).toEqual(['post-flair'])
    expect(fallback.post?.interactionMode).toEqual('policy_ballot')

    await writeParaFixture(network, async () =>
      createParaPostMeta(sc, alice, post.uri, {
        postType: 'policy',
        voteScore: 9,
        official: true,
        party: 'Independent',
        community: 'mx-federal',
        category: 'governance',
        tags: ['meta-tag'],
        flairs: ['meta-flair'],
      }),
    )

    const explicit = await network.bsky.ctx.dataplane.getParaPostMeta({
      postUri: post.uri,
    })
    expect(explicit.post?.postType).toEqual('policy')
    expect(explicit.post?.voteScore).toEqual(9)
    expect(explicit.post?.official).toBe(true)
    expect(explicit.post?.party).toEqual('Independent')
    expect(explicit.post?.community).toEqual('mx-federal')
    expect(explicit.post?.category).toEqual('governance')
    expect(explicit.post?.tags).toEqual(['meta-tag'])
    expect(explicit.post?.flairs).toEqual(['meta-flair'])
    expect(explicit.post?.interactionMode).toEqual('policy_ballot')
  })

  it('queries para profile stats and status', async () => {
    await writeParaFixture(network, async () => {
      await createParaStatus(sc, alice, {
        status: 'Building cross-party policy drafts',
        party: 'Independent',
        community: 'mx-federal',
      })
      const post = await createParaPost(sc, alice, 'stats para post', {
        postType: 'policy',
      })
      await createParaPostMeta(sc, alice, post.uri, {
        postType: 'policy',
        voteScore: 11,
        community: 'mx-federal',
      })
    })

    const res = await network.bsky.ctx.dataplane.getParaProfileStats({
      actorDid: alice,
    })
    expect(res.actorDid).toEqual(alice)
    expect(res.stats?.influence).toEqual(res.stats?.votesReceivedAllTime)
    expect(res.stats?.votesReceivedAllTime).toBeGreaterThanOrEqual(11)
    expect(res.stats?.contributions?.policies).toBeGreaterThanOrEqual(1)
    expect(res.stats?.activeIn).toContain('mx-federal')
    expect(res.status?.status).toEqual('Building cross-party policy drafts')
    expect(res.status?.party).toEqual('Independent')
    expect(res.status?.community).toEqual('mx-federal')
  })
})
