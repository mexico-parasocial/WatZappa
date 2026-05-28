import { SkeletonHandler } from '@atproto/pds'
import { AtUri, AtUriString } from '@atproto/syntax'
import { TestNetwork } from '../network.js'

/**
 * Seed data shape returned by para-demo.ts
 */
export interface ParaDemoSeedData {
  createdPosts: Array<{
    uri: string
    cid: string
    bskyUri: string
    bskyCid: string
    did: string
    party: string
    community?: string
    postType: string
    title: string
    createdAt: string
    likeCount: number
    official?: boolean
  }>
  users: Array<{
    short: string
    did: string
    name: string
    party: string
    agent: any
  }>
  alice: any
}

/**
 * Creates PARA-branded feed generators that appear in "Discover New Feeds".
 *
 * Uses pre-computed arrays of Bluesky post URIs from the para demo seed.
 * Each handler is a closure over the seed data — no runtime DB queries needed.
 */
export async function createParaFeedGens(
  network: TestNetwork,
  seedData: ParaDemoSeedData,
) {
  const { createdPosts, alice } = seedData

  if (!createdPosts.length || !alice) {
    console.log('  [para-feed-gens] Skipping — no seed data available')
    return
  }

  // Build feed arrays from seed data
  const withBsky = createdPosts.filter((p) => !!p.bskyUri)

  const paraTimeline = [...withBsky].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const paraHot = [...withBsky].sort((a, b) => {
    if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const paraDebates = withBsky
    .filter((p) => p.postType === 'policy' || p.postType === 'matter')
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  const paraMorena = withBsky
    .filter((p) => p.party === 'p/Morena')
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  const paraPan = withBsky
    .filter((p) => p.party === 'p/PAN')
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  const paraPri = withBsky
    .filter((p) => p.party === 'p/PRI')
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  const paraPvem = withBsky
    .filter((p) => p.party === 'p/PVEM')
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  const paraPt = withBsky
    .filter((p) => p.party === 'p/PT')
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  const paraMc = withBsky
    .filter((p) => p.party === 'p/MC')
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  const paraPrd = withBsky
    .filter((p) => p.party === 'p/PRD')
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  const paraIndependientes = withBsky
    .filter((p) => p.party === 'p/Independientes')
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

  // Bluesky-style generic feeds (appear in Discover New Feeds)
  const blueskyHot = [...paraHot] // same algorithm, branded as Bluesky
  const blueskyLatest = [...paraTimeline]
  const blueskyDiscover = [...withBsky].sort(() => Math.random() - 0.5)

  // Helper to build a SkeletonHandler from a sorted post array
  const makeHandler =
    (posts: typeof withBsky): SkeletonHandler =>
    async ({ params }) => {
      const limit = params.limit ?? 50
      const offset = params.cursor ? parseInt(params.cursor, 10) : 0
      const slice = posts.slice(offset, offset + limit)
      const nextCursor =
        offset + limit < posts.length ? (offset + limit).toString() : undefined
      return {
        encoding: 'application/json',
        body: {
          feed: slice.map((p) => ({ post: p.bskyUri as AtUriString })),
          cursor: nextCursor,
        },
      }
    }

  // Build feed URI → handler map
  const makeUri = (rkey: string) =>
    AtUri.make(alice.assertDid, 'app.bsky.feed.generator', rkey).toString()

  const paraFeedDefs = [
    { rkey: 'para-hot', name: 'Lo más relevante', posts: paraHot },
    { rkey: 'para-timeline', name: 'Cronología PARA', posts: paraTimeline },
    { rkey: 'para-debates', name: 'Debates y propuestas', posts: paraDebates },
    { rkey: 'para-morena', name: 'Morena', posts: paraMorena },
    { rkey: 'para-pan', name: 'PAN', posts: paraPan },
    { rkey: 'para-pri', name: 'PRI', posts: paraPri },
    { rkey: 'para-pvem', name: 'PVEM', posts: paraPvem },
    { rkey: 'para-pt', name: 'PT', posts: paraPt },
    { rkey: 'para-mc', name: 'MC', posts: paraMc },
    { rkey: 'para-prd', name: 'PRD', posts: paraPrd },
    {
      rkey: 'para-independientes',
      name: 'Independientes',
      posts: paraIndependientes,
    },
  ]

  const blueskyFeedDefs = [
    {
      rkey: 'bluesky-hot',
      name: "What's Hot",
      posts: blueskyHot,
      description: 'The most liked posts right now',
    },
    {
      rkey: 'bluesky-latest',
      name: 'Latest',
      posts: blueskyLatest,
      description: 'Newest posts from the network',
    },
    {
      rkey: 'bluesky-discover',
      name: 'Discover',
      posts: blueskyDiscover,
      description: 'A shuffle of interesting posts',
    },
  ]

  const allFeedDefs = [...paraFeedDefs, ...blueskyFeedDefs]
  const allDisplayNames = allFeedDefs.map((d) => d.name)

  const db = network.bsky.db.db

  // Clean up stale feed generators from previous dev-env runs.
  // We match by displayName OR by URI pattern (rkey starts with 'para-' or 'bluesky-').
  const staleByName = await db
    .selectFrom('feed_generator')
    .select('uri')
    .where('displayName', 'in', allDisplayNames)
    .execute()
  const staleByUri = await db
    .selectFrom('feed_generator')
    .select('uri')
    .where('uri', 'like', '%/app.bsky.feed.generator/para-%')
    .orWhere('uri', 'like', '%/app.bsky.feed.generator/bluesky-%')
    .execute()
  const staleUris = [
    ...new Set([
      ...staleByName.map((f) => f.uri),
      ...staleByUri.map((f) => f.uri),
    ]),
  ]
  if (staleUris.length) {
    await db
      .deleteFrom('suggested_feed')
      .where('uri', 'in', staleUris)
      .execute()
    await db
      .deleteFrom('feed_generator')
      .where('uri', 'in', staleUris)
      .execute()
  }

  const feeds: Record<string, SkeletonHandler> = {}
  for (const def of allFeedDefs) {
    feeds[makeUri(def.rkey)] = makeHandler(def.posts)
  }

  // Create the TestFeedGen (one HTTP server serving all feeds)
  const fg = await network.createFeedGen(feeds)

  // Publish app.bsky.feed.generator records for each feed.
  // Use .put (not .create) so the seed is idempotent across dev-env restarts.
  for (const def of allFeedDefs) {
    await alice.app.bsky.feed.generator.put(
      { repo: alice.assertDid, rkey: def.rkey },
      {
        did: fg.did,
        displayName: def.name,
        description:
          'description' in def
            ? def.description
            : `Feed generado por PARA: ${def.name}`,
        createdAt: new Date().toISOString(),
      },
    )
  }

  // Pin feeds to discovery via suggested_feed table.
  // Core PARA feeds at the top (order 1-3).
  // Bluesky feeds in the middle (order 10-12).
  // Other feeds (pre-existing) next (order 50+).
  // Party feeds last (order 100+) so they don't clutter Discover New Feeds.
  const coreFeeds = paraFeedDefs.slice(0, 3)
  const partyFeeds = paraFeedDefs.slice(3)
  const allOurUris = new Set(allFeedDefs.map((d) => makeUri(d.rkey)))

  // Get all other feed generators that exist in the database
  const otherFeeds = await db
    .selectFrom('feed_generator')
    .select('uri')
    .where('uri', 'not in', Array.from(allOurUris))
    .execute()

  // Clear and rebuild suggested_feed
  await db.deleteFrom('suggested_feed').execute()

  // Core PARA feeds first
  for (let i = 0; i < coreFeeds.length; i++) {
    await db
      .insertInto('suggested_feed')
      .values({ uri: makeUri(coreFeeds[i].rkey), order: i + 1 })
      .execute()
  }

  // Bluesky feeds next
  for (let i = 0; i < blueskyFeedDefs.length; i++) {
    await db
      .insertInto('suggested_feed')
      .values({ uri: makeUri(blueskyFeedDefs[i].rkey), order: 10 + i })
      .execute()
  }

  // Other feeds (e.g. pre-existing Bluesky mocks from full mock setup) next
  for (let i = 0; i < otherFeeds.length; i++) {
    await db
      .insertInto('suggested_feed')
      .values({ uri: otherFeeds[i].uri, order: 50 + i })
      .execute()
  }

  // Party feeds last (order 100+) so they don't clutter Discover New Feeds
  for (let i = 0; i < partyFeeds.length; i++) {
    await db
      .insertInto('suggested_feed')
      .values({ uri: makeUri(partyFeeds[i].rkey), order: 100 + i })
      .execute()
  }

  console.log(
    `  [para-feed-gens] Created ${paraFeedDefs.length} PARA + ${blueskyFeedDefs.length} Bluesky feeds via ${fg.did}`,
  )
}
