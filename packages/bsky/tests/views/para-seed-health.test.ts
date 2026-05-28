import { request } from 'undici'
import {
  SeedClient,
  TestNetwork,
  createCabildeoRecord,
  createCabildeoVoteRecord,
  createCommunityBoardRecord,
  createCommunityMembershipRecord,
  createParaPost,
  createParaPostMeta,
  createParaStatus,
  usersSeed,
  writeParaFixture,
} from '@atproto/dev-env'

describe('para seed health contract', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: string
  let bob: string

  beforeAll(async () => {
    const schemaSuffix = Array.from({ length: 8 }, () =>
      String.fromCharCode(97 + Math.floor(Math.random() * 26)),
    ).join('')
    network = await TestNetwork.create({
      dbPostgresSchema: `bsky_para_seed_health_${schemaSuffix}`,
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    alice = sc.dids.alice
    bob = sc.dids.bob
  })

  afterAll(async () => {
    await network?.close()
  })

  it('writes a minimal PARA world and reads it through dataplane and XRPC', async () => {
    const fixture = await writeParaFixture(network, async () => {
      const board = await createCommunityBoardRecord(sc, alice, {
        name: 'Seed Health',
        quadrant: 'health',
      })
      await createCommunityMembershipRecord(sc, alice, board.uri, 'active')
      await createCommunityMembershipRecord(sc, bob, board.uri, 'active')

      const cabildeo = await createCabildeoRecord(sc, alice, {
        title: 'Seed health cabildeo',
        description: 'A compact contract fixture.',
        community: 'seed-health',
        phase: 'voting',
        options: [{ label: 'Yes' }, { label: 'No' }],
      })
      const post = await createParaPost(sc, alice, 'seed health para post', {
        postType: 'policy',
      })
      await createParaPostMeta(sc, alice, post.uri, {
        postType: 'policy',
        voteScore: 7,
        community: 'seed-health',
      })
      await createParaStatus(sc, alice, {
        status: 'Seed health online',
        community: 'seed-health',
      })
      await createCabildeoVoteRecord(sc, bob, {
        cabildeo: cabildeo.uri,
        selectedOption: 0,
        isDirect: true,
      })

      return { cabildeo, post }
    })

    const postMeta = await network.bsky.ctx.dataplane.getParaPostMeta({
      postUri: fixture.post.uri,
    })
    expect(postMeta.post?.uri).toBe(fixture.post.uri)

    const cabildeo = await network.bsky.ctx.dataplane.getParaCabildeo({
      cabildeoUri: fixture.cabildeo.uri,
      viewerDid: bob,
    })
    expect(cabildeo.cabildeoJson).toContain(fixture.cabildeo.uri)

    const posts = await callParaRaw(
      network,
      'com.para.feed.getPosts',
      {
        uris: [fixture.post.uri],
      },
      bob,
    )
    expect(posts.status).toBe(200)
    expect(
      (posts.body as { posts: Array<{ uri: string }> }).posts[0]?.uri,
    ).toBe(fixture.post.uri)

    const detail = await callParaRaw(
      network,
      'com.para.civic.getCabildeo',
      {
        cabildeo: fixture.cabildeo.uri,
      },
      bob,
    )
    expect(detail.status).toBe(200)
    expect((detail.body as { cabildeo: { uri: string } }).cabildeo.uri).toBe(
      fixture.cabildeo.uri,
    )
  })
})

const callParaRaw = async (
  network: TestNetwork,
  nsid: string,
  params: Record<string, string | string[]>,
  did: string,
) => {
  const url = new URL(`/xrpc/${nsid}`, network.bsky.url)
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item)
    } else {
      url.searchParams.set(key, value)
    }
  }
  const res = await request(url, {
    headers: await network.serviceHeaders(did, nsid),
  })
  return {
    status: res.statusCode,
    body: await res.body.json(),
  }
}
