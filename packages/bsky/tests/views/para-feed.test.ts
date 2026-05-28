import { request } from 'undici'
import { AtpAgent } from '@atproto/api'
import {
  SeedClient,
  TestNetwork,
  createCabildeoDelegationRecord,
  createCabildeoPositionRecord,
  createCabildeoRecord,
  createCabildeoVoteRecord,
  createCommunityBoardRecord,
  createCommunityGovernanceRecord,
  createCommunityMembershipRecord,
  createLiveStatusRecord,
  createParaPost,
  createParaPostMeta,
  createParaStatus,
  likeParaRecord,
  usersSeed,
  writeParaFixture,
} from '@atproto/dev-env'
import { ids } from '../../src/lexicon/lexicons.js'

type ParaPostView = {
  uri: string
  cid: string
  author: string
  text: string
  createdAt: string
  replyRoot?: string
  replyParent?: string
}

type ParaTimelineOutput = {
  cursor?: string
  feed: ParaPostView[]
}

type ParaPostsOutput = {
  posts: ParaPostView[]
}

type ParaThreadOutput = {
  post: ParaPostView
  parents: ParaPostView[]
  replies: ParaPostView[]
}

type ParaPostMetaOutput = {
  uri: string
  postType?: 'policy' | 'matter' | 'meme'
  official?: boolean
  party?: string
  community?: string
  category?: string
  tags?: string[]
  flairs?: string[]
  voteScore: number
  interactionMode: 'policy_ballot' | 'reddit_votes'
  createdAt?: string
}

type ParaProfileStatsOutput = {
  actor: string
  stats: {
    influence: number
    votesReceivedAllTime: number
    votesCastAllTime: number
    contributions: {
      policies: number
      matters: number
      comments: number
    }
    activeIn: string[]
    computedAt: string
  }
  status?: {
    status: string
    party?: string
    community?: string
    createdAt: string
  }
}

type ParaCommunityGovernanceOutput = {
  source?: string
  community: string
  communityId?: string
  slug: string
  createdAt: string
  updatedAt: string
  moderators: Array<{
    did?: string
    handle?: string
    displayName?: string
    avatar?: string
    role: string
    badge: string
    capabilities: string[]
  }>
  officials: Array<{
    did?: string
    handle?: string
    displayName?: string
    avatar?: string
    office: string
    mandate: string
  }>
  deputies: Array<{
    key: string
    tier: string
    role: string
    description: string
    capabilities: string[]
    activeHolder?: {
      did?: string
      handle?: string
      displayName?: string
      avatar?: string
    }
    activeSince?: string
    votes: number
    applicants: Array<{
      did?: string
      handle?: string
      displayName?: string
      avatar?: string
      appliedAt: string
      status: 'applied' | 'approved' | 'rejected'
      note?: string
    }>
  }>
  metadata?: {
    termLengthDays?: number
    reviewCadence?: string
    escalationPath?: string
    publicContact?: string
    lastPublishedAt?: string
    state?: string
    matterFlairIds?: string[]
    policyFlairIds?: string[]
  }
  editHistory: Array<{
    id: string
    action: string
    actorDid?: string
    actorHandle?: string
    createdAt: string
    summary: string
  }>
  counters: {
    members: number
    visiblePosters: number
    policyPosts: number
    matterPosts: number
    badgeHolders: number
  }
}

type ParaCabildeoOptionSummary = {
  optionIndex: number
  label: string
  votes: number
  positions: number
}

type ParaCabildeoOutput = {
  uri: string
  creator: string
  title: string
  description: string
  community: string
  phase: string
  optionSummary: ParaCabildeoOptionSummary[]
  positionCounts: {
    total: number
    for: number
    against: number
    amendment: number
  }
  voteTotals: {
    total: number
    direct: number
    delegated: number
  }
  outcomeSummary?: {
    winningOption?: number
    totalParticipants: number
    effectiveTotalPower: number
    tie: boolean
    breakdown: ParaCabildeoOptionSummary[]
  }
  viewerContext?: {
    activeDelegation?: string
    delegateHasVoted?: boolean
    delegatedVoteOption?: number
  }
  liveSession?: {
    isLive: boolean
    hostDid: string
    activeParticipantCount: number
    startedAt: string
    participantPreviewDids: string[]
  }
}

type ParaListCabildeosOutput = {
  cursor?: string
  cabildeos: ParaCabildeoOutput[]
}

type ParaGetCabildeoOutput = {
  cabildeo: ParaCabildeoOutput
}

type ParaListCabildeoPositionsOutput = {
  cursor?: string
  positions: Array<{
    uri: string
    cabildeo: string
    stance: 'for' | 'against' | 'amendment' | string
    optionIndex?: number
    text: string
  }>
}

describe('para feed views', () => {
  let network: TestNetwork
  let agent: AtpAgent
  let sc: SeedClient
  let alice: string
  let bob: string
  let carol: string
  let dan: string

  beforeAll(async () => {
    const schemaSuffix = Array.from({ length: 8 }, () =>
      String.fromCharCode(97 + Math.floor(Math.random() * 26)),
    ).join('')
    network = await TestNetwork.create({
      dbPostgresSchema: `bsky_views_para_feed_${schemaSuffix}`,
    })
    agent = network.bsky.getAgent()
    sc = network.getSeedClient()
    await usersSeed(sc)
    alice = sc.dids.alice
    bob = sc.dids.bob
    carol = sc.dids.carol
    dan = sc.dids.dan
    await writeParaFixture(network, async () => {
      const mxFederal = await createCommunityBoardRecord(sc, alice, {
        name: 'MX Federal',
        quadrant: 'federal',
      })
      for (const did of [alice, bob, carol, dan]) {
        await createCommunityMembershipRecord(sc, did, mxFederal.uri, 'active')
      }
    })
  })

  afterAll(async () => {
    await network?.close()
  })

  it('returns self+follow timeline and excludes muted authors', async () => {
    await sc.follow(alice, bob)

    const alicePost = await createParaPost(
      sc,
      alice,
      'alice timeline para post',
    )
    const bobPost = await createParaPost(sc, bob, 'bob timeline para post')
    const carolPost = await createParaPost(
      sc,
      carol,
      'carol timeline para post',
    )
    await network.processAll()

    const beforeMute = await callPara<ParaTimelineOutput>(
      network,
      'com.para.feed.getTimeline',
      { limit: 50 },
      alice,
    )
    const beforeMuteUris = beforeMute.feed.map((item) => item.uri)

    expect(beforeMuteUris).toContain(alicePost.uri)
    expect(beforeMuteUris).toContain(bobPost.uri)
    expect(beforeMuteUris).not.toContain(carolPost.uri)

    await agent.api.app.bsky.graph.muteActor(
      { actor: bob },
      {
        encoding: 'application/json',
        headers: await network.serviceHeaders(alice, ids.AppBskyGraphMuteActor),
      },
    )
    await network.processAll()

    const afterMute = await callPara<ParaTimelineOutput>(
      network,
      'com.para.feed.getTimeline',
      { limit: 50 },
      alice,
    )
    const afterMuteUris = afterMute.feed.map((item) => item.uri)

    expect(afterMuteUris).toContain(alicePost.uri)
    expect(afterMuteUris).not.toContain(bobPost.uri)
  })

  it('dedupes requested uris and excludes muted authors in getPosts', async () => {
    const bobPost = await createParaPost(sc, bob, 'bob dedupe para post')
    const alicePost = await createParaPost(sc, alice, 'alice dedupe para post')
    await network.processAll()

    const beforeMute = await callPara<ParaPostsOutput>(
      network,
      'com.para.feed.getPosts',
      {
        uris: [bobPost.uri, bobPost.uri, alicePost.uri],
      },
      carol,
    )

    expect(beforeMute.posts.map((item) => item.uri)).toEqual([
      bobPost.uri,
      alicePost.uri,
    ])

    await agent.api.app.bsky.graph.muteActor(
      { actor: bob },
      {
        encoding: 'application/json',
        headers: await network.serviceHeaders(carol, ids.AppBskyGraphMuteActor),
      },
    )
    await network.processAll()

    const afterMute = await callPara<ParaPostsOutput>(
      network,
      'com.para.feed.getPosts',
      {
        uris: [bobPost.uri, alicePost.uri],
      },
      carol,
    )

    expect(afterMute.posts.map((item) => item.uri)).toEqual([alicePost.uri])
  })

  it('excludes malformed descendants from para thread output', async () => {
    const rootA = await createParaPost(sc, alice, 'para root A')
    const rootB = await createParaPost(sc, alice, 'para root B')
    const reply1 = await createParaPost(sc, bob, 'para reply 1', {
      reply: {
        root: rootA,
        parent: rootA,
      },
    })
    const badReply = await createParaPost(sc, carol, 'para bad reply', {
      reply: {
        root: rootB,
        parent: reply1,
      },
    })
    const goodReply = await createParaPost(sc, dan, 'para good reply', {
      reply: {
        root: rootA,
        parent: reply1,
      },
    })
    await network.processAll()

    const thread = await callPara<ParaThreadOutput>(
      network,
      'com.para.feed.getPostThread',
      { uri: reply1.uri, depth: 10, parentHeight: 10 },
      dan,
    )

    expect(thread.post.uri).toEqual(reply1.uri)
    expect(thread.parents.map((item) => item.uri)).toEqual([rootA.uri])
    expect(thread.replies.map((item) => item.uri)).toContain(goodReply.uri)
    expect(thread.replies.map((item) => item.uri)).not.toContain(badReply.uri)
  })

  it('returns para post meta with fallback and explicit metadata override', async () => {
    const post = await createParaPost(sc, alice, 'para post with metadata', {
      postType: 'policy',
      tags: ['fallback-tag'],
      flairs: ['fallback-flair'],
    })
    await likeParaRecord(sc, bob, post)
    await network.processAll()

    const fallback = await callPara<ParaPostMetaOutput>(
      network,
      'com.para.social.getPostMeta',
      { post: post.uri },
      alice,
    )
    expect(fallback.uri).toEqual(post.uri)
    expect(fallback.postType).toEqual('policy')
    expect(fallback.interactionMode).toEqual('policy_ballot')
    expect(fallback.voteScore).toBeGreaterThanOrEqual(1)
    expect(fallback.tags).toEqual(['fallback-tag'])
    expect(fallback.flairs).toEqual(['fallback-flair'])

    await createParaPostMeta(sc, alice, post.uri, {
      postType: 'matter',
      official: true,
      party: 'Independent',
      community: 'mx-politics',
      category: 'governance',
      tags: ['meta-tag'],
      flairs: ['meta-flair'],
      voteScore: 42,
    })
    await network.processAll()

    const explicit = await callPara<ParaPostMetaOutput>(
      network,
      'com.para.social.getPostMeta',
      { post: post.uri },
      alice,
    )
    expect(explicit.postType).toEqual('matter')
    expect(explicit.interactionMode).toEqual('reddit_votes')
    expect(explicit.voteScore).toEqual(42)
    expect(explicit.official).toEqual(true)
    expect(explicit.party).toEqual('Independent')
    expect(explicit.community).toEqual('mx-politics')
    expect(explicit.category).toEqual('governance')
    expect(explicit.tags).toEqual(['meta-tag'])
    expect(explicit.flairs).toEqual(['meta-flair'])
  })

  it('returns not found for unknown para post metadata', async () => {
    const res = await callParaRaw(
      network,
      'com.para.social.getPostMeta',
      { post: 'at://did:example:fake/com.para.post/self' },
      alice,
    )
    expect(res.status).toBe(400)
    expect((res.body as { error?: string }).error).toBe('NotFound')
  })

  it('recomputes para profile stats from para indexing signals', async () => {
    const beforeAliceStats = await network.bsky.db.db
      .selectFrom('para_profile_stats')
      .where('did', '=', alice)
      .selectAll()
      .executeTakeFirst()
    const beforeBobStats = await network.bsky.db.db
      .selectFrom('para_profile_stats')
      .where('did', '=', bob)
      .selectAll()
      .executeTakeFirst()

    const post = await createParaPost(sc, alice, 'stats post', {
      postType: 'policy',
    })
    await network.processAll()

    await createParaPostMeta(sc, alice, post.uri, {
      postType: 'policy',
      voteScore: 7,
      community: 'mx-federal',
    })
    await likeParaRecord(sc, bob, post)
    await network.processAll()

    const aliceStats = await network.bsky.db.db
      .selectFrom('para_profile_stats')
      .where('did', '=', alice)
      .selectAll()
      .executeTakeFirst()
    const bobStats = await network.bsky.db.db
      .selectFrom('para_profile_stats')
      .where('did', '=', bob)
      .selectAll()
      .executeTakeFirst()

    expect(aliceStats).toBeDefined()
    expect(aliceStats?.influence).toEqual(aliceStats?.votesReceivedAllTime)
    expect(aliceStats?.votesReceivedAllTime).toBeGreaterThanOrEqual(
      (beforeAliceStats?.votesReceivedAllTime ?? 0) + 7,
    )
    expect(aliceStats?.policies).toBeGreaterThanOrEqual(1)
    expect(aliceStats?.activeIn).toContain('mx-federal')

    expect(bobStats).toBeDefined()
    expect(bobStats?.votesCastAllTime).toBeGreaterThanOrEqual(
      (beforeBobStats?.votesCastAllTime ?? 0) + 1,
    )
  })

  it('returns para profile stats and status view for an actor', async () => {
    await createParaStatus(sc, alice, {
      status: 'Building cross-party policy drafts',
      party: 'Independent',
      community: 'mx-federal',
    })
    const post = await createParaPost(
      sc,
      alice,
      'profile stats endpoint post',
      {
        postType: 'policy',
      },
    )
    await createParaPostMeta(sc, alice, post.uri, {
      postType: 'policy',
      voteScore: 11,
      community: 'mx-federal',
    })
    await likeParaRecord(sc, bob, post)
    await network.processAll()

    const profile = await callPara<ParaProfileStatsOutput>(
      network,
      'com.para.actor.getProfileStats',
      { actor: alice },
      bob,
    )

    expect(profile.actor).toEqual(alice)
    expect(profile.stats.votesReceivedAllTime).toBeGreaterThanOrEqual(11)
    expect(profile.stats.votesCastAllTime).toBeGreaterThanOrEqual(0)
    expect(profile.stats.influence).toEqual(profile.stats.votesReceivedAllTime)
    expect(profile.stats.contributions.policies).toBeGreaterThanOrEqual(1)
    expect(profile.stats.activeIn).toContain('mx-federal')
    expect(profile.status).toBeDefined()
    expect(profile.status?.status).toEqual('Building cross-party policy drafts')
    expect(profile.status?.party).toEqual('Independent')
    expect(profile.status?.community).toEqual('mx-federal')
  })

  it('returns not found for unknown actor profile stats', async () => {
    const res = await callParaRaw(
      network,
      'com.para.actor.getProfileStats',
      { actor: 'did:example:missing' },
      alice,
    )
    expect(res.status).toBe(400)
    expect((res.body as { error?: string }).error).toBe('NotFound')
  })

  it('returns published para community governance merged with computed counters', async () => {
    await createParaStatus(sc, alice, {
      status: 'Alice status',
      party: 'Independent',
      community: 'mx-federal',
    })
    await createParaStatus(sc, bob, {
      status: 'Bob status',
      party: 'PAN',
      community: 'mx-federal',
    })

    const alicePost = await createParaPost(sc, alice, 'gov policy post', {
      postType: 'policy',
    })
    const bobPost = await createParaPost(sc, bob, 'gov matter post', {
      postType: 'matter',
    })
    await createParaPostMeta(sc, alice, alicePost.uri, {
      postType: 'policy',
      voteScore: 3,
      community: 'mx-federal',
    })
    await createParaPostMeta(sc, bob, bobPost.uri, {
      postType: 'matter',
      voteScore: 2,
      community: 'mx-federal',
    })
    await createCommunityGovernanceRecord(sc, alice, 'mx-federal', {
      moderators: [
        {
          did: alice,
          handle: 'alice.test',
          displayName: 'Alice Moderator',
          role: 'Lead moderator',
          badge: 'Moderation Lead',
          capabilities: ['publish_governance_updates'],
        },
      ],
      officials: [
        {
          did: bob,
          handle: 'bob.test',
          displayName: 'Bob Official',
          office: 'Official representative',
          mandate: 'Represents policy consensus.',
        },
      ],
      deputies: [
        {
          key: 'policy-deputy',
          tier: 'Tier II',
          role: 'Policy Deputy',
          description: 'Maintains policy queues.',
          capabilities: ['Triage policy proposals'],
          activeHolder: {
            did: bob,
            handle: 'bob.test',
            displayName: 'Bob Official',
          },
          votes: 12,
          applicants: [
            {
              did: carol,
              displayName: 'Carol Applicant',
              appliedAt: new Date().toISOString(),
              status: 'applied',
            },
          ],
        },
      ],
      metadata: {
        state: 'Federal District',
        reviewCadence: 'Monthly governance review',
        matterFlairIds: ['matter_democracia'],
        policyFlairIds: ['policy_limite_mandatos'],
      },
      editHistory: [
        {
          id: 'seed-governance',
          action: 'publish_governance_updates',
          createdAt: new Date().toISOString(),
          summary: 'Initial governance seeded.',
        },
      ],
    })
    await likeParaRecord(sc, bob, alicePost)
    await network.processAll()

    const governance = await callPara<ParaCommunityGovernanceOutput>(
      network,
      'com.para.community.getGovernance',
      { community: 'mx-federal', limit: 25 },
      alice,
    )

    expect(governance.community).toEqual('mx-federal')
    expect(governance.slug).toEqual('mx-federal')
    expect(governance.counters.members).toBeGreaterThanOrEqual(2)
    expect(governance.counters.policyPosts).toBeGreaterThanOrEqual(1)
    expect(governance.counters.matterPosts).toBeGreaterThanOrEqual(1)
    expect(governance.moderators).toHaveLength(1)
    expect(governance.moderators[0]?.did).toEqual(alice)
    expect(governance.officials).toHaveLength(1)
    expect(governance.officials[0]?.did).toEqual(bob)
    expect(governance.deputies).toHaveLength(1)
    expect(governance.deputies[0]?.key).toEqual('policy-deputy')
    expect(governance.deputies[0]?.votes).toEqual(12)
    expect(governance.metadata?.reviewCadence).toEqual(
      'Monthly governance review',
    )
    expect(governance.metadata?.state).toEqual('Federal District')
    expect(governance.metadata?.matterFlairIds).toEqual(['matter_democracia'])
    expect(governance.metadata?.policyFlairIds).toEqual([
      'policy_limite_mandatos',
    ])
    expect(governance.editHistory[0]?.id).toEqual('seed-governance')
  })

  it('returns empty governance rosters when no governance record exists', async () => {
    await createParaStatus(sc, dan, {
      status: 'Dan status',
      party: 'Independent',
      community: 'mx-no-governance',
    })
    await network.processAll()

    const governance = await callPara<ParaCommunityGovernanceOutput>(
      network,
      'com.para.community.getGovernance',
      { community: 'mx-no-governance', limit: 25 },
      dan,
    )

    expect(governance.community).toEqual('mx-no-governance')
    expect(governance.moderators).toHaveLength(0)
    expect(governance.officials).toHaveLength(0)
    expect(governance.deputies).toHaveLength(0)
    expect(governance.counters.members).toBeGreaterThanOrEqual(1)
  })

  it('returns live cabildeo views with aggregates and viewer delegation context', async () => {
    const cabildeo = await createCabildeoRecord(sc, alice, {
      title: 'Cabildeo de agua',
      description: 'Debate sobre abastecimiento regional.',
      community: 'mx-federal',
      phase: 'resolved',
      options: [{ label: 'Invertir' }, { label: 'Mantener' }],
    })
    await network.processAll()
    await createCabildeoPositionRecord(sc, bob, {
      cabildeo: cabildeo.uri,
      stance: 'for',
      optionIndex: 0,
      text: 'La inversion mejora la infraestructura.',
    })
    await createCabildeoPositionRecord(sc, carol, {
      cabildeo: cabildeo.uri,
      stance: 'against',
      optionIndex: 1,
      text: 'No hay presupuesto suficiente.',
    })
    await createCabildeoPositionRecord(sc, dan, {
      cabildeo: cabildeo.uri,
      stance: 'amendment',
      optionIndex: 0,
      text: 'Hagamos un plan escalonado.',
    })
    await createCabildeoVoteRecord(sc, bob, {
      cabildeo: cabildeo.uri,
      selectedOption: 0,
      isDirect: true,
    })
    await createCabildeoVoteRecord(sc, carol, {
      cabildeo: cabildeo.uri,
      selectedOption: 1,
      isDirect: true,
    })
    await createCabildeoDelegationRecord(sc, dan, {
      cabildeo: cabildeo.uri,
      delegateTo: bob,
    })
    await network.processAll()
    await network.processAll()
    const list = await callPara<ParaListCabildeosOutput>(
      network,
      'com.para.civic.listCabildeos',
      { community: 'mx-federal', limit: 25 },
      dan,
    )
    const listed = list.cabildeos.find((item) => item.uri === cabildeo.uri)
    expect(listed).toBeDefined()
    expect(listed?.positionCounts.total).toBe(3)
    expect(listed?.positionCounts.for).toBe(1)
    expect(listed?.positionCounts.against).toBe(1)
    expect(listed?.positionCounts.amendment).toBe(1)
    expect(listed?.voteTotals.total).toBe(2)
    expect(listed?.voteTotals.direct).toBe(2)
    expect(listed?.voteTotals.delegated).toBe(0)
    expect(listed?.optionSummary[0]?.votes).toBe(1)
    expect(listed?.optionSummary[1]?.votes).toBe(1)
    expect(listed?.viewerContext?.activeDelegation).toBe(bob)
    expect(listed?.viewerContext?.delegateHasVoted).toBe(true)
    expect(listed?.viewerContext?.delegatedVoteOption).toBe(0)
    expect(listed?.outcomeSummary?.totalParticipants).toBe(2)

    const detail = await callPara<ParaGetCabildeoOutput>(
      network,
      'com.para.civic.getCabildeo',
      { cabildeo: cabildeo.uri },
      dan,
    )
    expect(detail.cabildeo.uri).toBe(cabildeo.uri)
    expect(detail.cabildeo.positionCounts.total).toBe(3)

    const positions = await callPara<ParaListCabildeoPositionsOutput>(
      network,
      'com.para.civic.listCabildeoPositions',
      { cabildeo: cabildeo.uri, limit: 50 },
      dan,
    )
    expect(positions.positions).toHaveLength(3)
    expect(positions.positions.map((item) => item.stance)).toEqual(
      expect.arrayContaining(['for', 'against', 'amendment']),
    )
  })

  it('indexes only eligible cabildeo votes and keeps the latest vote per member', async () => {
    const board = await createCommunityBoardRecord(sc, alice, {
      name: 'Vote Guardrails',
      quadrant: 'west',
    })
    await createCommunityMembershipRecord(sc, bob, board.uri, 'active')
    await createCommunityMembershipRecord(sc, carol, board.uri, 'active')
    await network.processAll()

    const cabildeo = await createCabildeoRecord(sc, alice, {
      title: 'Vote guardrails',
      description: 'Only active members can cast one effective vote.',
      community: 'vote-guardrails',
      phase: 'voting',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    await network.processAll()
    await createCabildeoVoteRecord(sc, bob, {
      cabildeo: cabildeo.uri,
      selectedOption: 0,
      isDirect: true,
    })
    await createCabildeoVoteRecord(sc, bob, {
      cabildeo: cabildeo.uri,
      selectedOption: 1,
      isDirect: true,
    })
    await createCabildeoVoteRecord(sc, carol, {
      cabildeo: cabildeo.uri,
      selectedOption: 4,
      isDirect: true,
    })
    await createCabildeoVoteRecord(sc, dan, {
      cabildeo: cabildeo.uri,
      selectedOption: 0,
      isDirect: true,
    })
    await network.processAll()
    await network.processAll()

    const detail = await callPara<ParaGetCabildeoOutput>(
      network,
      'com.para.civic.getCabildeo',
      { cabildeo: cabildeo.uri },
      bob,
    )
    expect(detail.cabildeo.voteTotals.total).toBe(1)
    expect(detail.cabildeo.voteTotals.direct).toBe(1)
    expect(detail.cabildeo.optionSummary[0]?.votes).toBe(0)
    expect(detail.cabildeo.optionSummary[1]?.votes).toBe(1)
    expect(detail.cabildeo.outcomeSummary?.winningOption).toBe(1)

    const draft = await createCabildeoRecord(sc, alice, {
      title: 'Draft vote guardrail',
      description: 'Draft cabildeos cannot receive effective votes.',
      community: 'vote-guardrails',
      phase: 'draft',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    await network.processAll()
    await createCabildeoVoteRecord(sc, bob, {
      cabildeo: draft.uri,
      selectedOption: 0,
      isDirect: true,
    })
    await network.processAll()
    await network.processAll()

    const draftDetail = await callPara<ParaGetCabildeoOutput>(
      network,
      'com.para.civic.getCabildeo',
      { cabildeo: draft.uri },
      bob,
    )
    expect(draftDetail.cabildeo.voteTotals.total).toBe(0)
    expect(draftDetail.cabildeo.optionSummary[0]?.votes).toBe(0)
  })

  it('counts one effective cabildeo vote for shared m8 vote nullifiers', async () => {
    const board = await createCommunityBoardRecord(sc, alice, {
      name: 'M8 one person one vote',
      quadrant: 'center',
    })
    await createCommunityMembershipRecord(sc, bob, board.uri, 'active')
    await createCommunityMembershipRecord(sc, carol, board.uri, 'active')
    await network.processAll()

    const cabildeo = await createCabildeoRecord(sc, alice, {
      title: 'Nullifier voting',
      description: 'A person voting through two aliases still counts once.',
      community: 'm8-one-person-one-vote',
      phase: 'voting',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    await network.processAll()

    const voteNullifier = 'm8-test-nullifier-shared-person'
    await createNullifiedCabildeoVoteRecord(sc, bob, {
      cabildeo: cabildeo.uri,
      selectedOption: 0,
      isDirect: true,
      voteNullifier,
      eligibilityProofRef: 'm8:civic-vote-proof:test-bob',
    })
    await network.processAll()
    await network.processAll()

    await createNullifiedCabildeoVoteRecord(sc, carol, {
      cabildeo: cabildeo.uri,
      selectedOption: 1,
      isDirect: true,
      voteNullifier,
      eligibilityProofRef: 'm8:civic-vote-proof:test-carol',
    })
    await network.processAll()
    await network.processAll()

    const detail = await callPara<ParaGetCabildeoOutput>(
      network,
      'com.para.civic.getCabildeo',
      { cabildeo: cabildeo.uri },
      carol,
    )
    expect(detail.cabildeo.voteTotals.total).toBe(1)
    expect(detail.cabildeo.voteTotals.direct).toBe(1)
    expect(detail.cabildeo.optionSummary[0]?.votes).toBe(0)
    expect(detail.cabildeo.optionSummary[1]?.votes).toBe(1)
  })

  it('requires active community membership before listing civic members or delegates', async () => {
    const board = await createCommunityBoardRecord(sc, alice, {
      name: 'Privacy Board',
      quadrant: 'northwest',
    })
    await createCommunityMembershipRecord(sc, alice, board.uri, 'active')
    await network.processAll()

    const noAuthMembers = await callParaRaw(
      network,
      'com.para.community.listMembers',
      { communityId: 'privacy-board' },
    )
    expect(noAuthMembers.status).toBe(401)
    expect((noAuthMembers.body as { error?: string }).error).toBe(
      'AuthenticationRequired',
    )

    const nonMemberMembers = await callParaRaw(
      network,
      'com.para.community.listMembers',
      { communityId: 'privacy-board' },
      bob,
    )
    expect(nonMemberMembers.status).toBe(400)
    expect((nonMemberMembers.body as { error?: string }).error).toBe(
      'CommunityMembershipRequired',
    )

    const memberMembers = await callPara<{
      members: Array<{ did: string; membershipState: string }>
    }>(
      network,
      'com.para.community.listMembers',
      { communityId: 'privacy-board' },
      alice,
    )
    expect(memberMembers.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ did: alice, membershipState: 'active' }),
      ]),
    )

    const cabildeo = await createCabildeoRecord(sc, alice, {
      title: 'Private delegates',
      description: 'Delegate candidates are visible to active members only.',
      community: 'privacy-board',
      phase: 'voting',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    await network.processAll()

    const noAuthDelegates = await callParaRaw(
      network,
      'com.para.civic.listDelegationCandidates',
      { cabildeo: cabildeo.uri },
    )
    expect(noAuthDelegates.status).toBe(401)
    expect((noAuthDelegates.body as { error?: string }).error).toBe(
      'AuthenticationRequired',
    )

    const nonMemberDelegates = await callParaRaw(
      network,
      'com.para.civic.listDelegationCandidates',
      { cabildeo: cabildeo.uri },
      bob,
    )
    expect(nonMemberDelegates.status).toBe(400)
    expect((nonMemberDelegates.body as { error?: string }).error).toBe(
      'CommunityMembershipRequired',
    )

    const memberDelegates = await callPara<{ candidates: unknown[] }>(
      network,
      'com.para.civic.listDelegationCandidates',
      { cabildeo: cabildeo.uri },
      alice,
    )
    expect(memberDelegates.candidates).toEqual(expect.any(Array))
  })

  it('supports cabildeo cursor pagination with stable URIs', async () => {
    const first = await createCabildeoRecord(sc, bob, {
      title: 'Cabildeo 1',
      description: 'Paginated record one',
      community: 'mx-pagination',
      phase: 'open',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    const second = await createCabildeoRecord(sc, bob, {
      title: 'Cabildeo 2',
      description: 'Paginated record two',
      community: 'mx-pagination',
      phase: 'open',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    await network.processAll()

    const pageOne = await callPara<ParaListCabildeosOutput>(
      network,
      'com.para.civic.listCabildeos',
      { community: 'mx-pagination', limit: 1 },
      bob,
    )
    expect(pageOne.cabildeos).toHaveLength(1)
    expect(pageOne.cabildeos[0]?.uri).toMatch(/^at:\/\//)
    expect(pageOne.cursor).toBeTruthy()

    const pageTwo = await callPara<ParaListCabildeosOutput>(
      network,
      'com.para.civic.listCabildeos',
      { community: 'mx-pagination', limit: 1, cursor: pageOne.cursor },
      bob,
    )
    expect(pageTwo.cabildeos).toHaveLength(1)
    expect(pageTwo.cabildeos[0]?.uri).toMatch(/^at:\/\//)
    expect(pageTwo.cabildeos[0]?.uri).not.toEqual(pageOne.cabildeos[0]?.uri)
    expect(
      [first.uri, second.uri].includes(pageOne.cabildeos[0]?.uri || ''),
    ).toBe(true)
    expect(
      [first.uri, second.uri].includes(pageTwo.cabildeos[0]?.uri || ''),
    ).toBe(true)
  })

  it('returns not found for missing cabildeo detail', async () => {
    const res = await callParaRaw(
      network,
      'com.para.civic.getCabildeo',
      { cabildeo: 'at://did:example:missing/com.para.civic.cabildeo/self' },
      alice,
    )
    expect(res.status).toBe(400)
    expect((res.body as { error?: string }).error).toBe('NotFound')
  })

  it('surfaces live cabildeo metadata on cabildeos and participant profiles', async () => {
    const cabildeo = await createCabildeoRecord(sc, alice, {
      title: 'Live cabildeo',
      description: 'Real-time deliberation',
      community: 'mx-live',
      phase: 'open',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    await createLiveStatusRecord(sc, alice, {
      uri: 'https://live.example.com/cabildeo/alice',
    })
    await network.processAll()

    const hostPresence = await callParaProcedure<{
      cabildeo: string
      present: boolean
      expiresAt?: string
    }>(
      network,
      'com.para.civic.putLivePresence',
      {
        cabildeo: cabildeo.uri,
        sessionId: 'alice-live-session',
      },
      alice,
    )
    expect(hostPresence.present).toBe(true)

    const participantPresence = await callParaProcedure<{
      cabildeo: string
      present: boolean
    }>(
      network,
      'com.para.civic.putLivePresence',
      {
        cabildeo: cabildeo.uri,
        sessionId: 'dan-live-session',
      },
      dan,
    )
    expect(participantPresence.present).toBe(true)

    const listed = await callPara<ParaListCabildeosOutput>(
      network,
      'com.para.civic.listCabildeos',
      { community: 'mx-live', limit: 10 },
      bob,
    )
    expect(listed.cabildeos[0]?.uri).toBe(cabildeo.uri)
    expect(listed.cabildeos[0]?.liveSession).toEqual(
      expect.objectContaining({
        isLive: true,
        hostDid: alice,
        activeParticipantCount: 2,
      }),
    )
    expect(listed.cabildeos[0]?.liveSession?.participantPreviewDids).toEqual(
      expect.arrayContaining([alice, dan]),
    )

    const detail = await callPara<ParaGetCabildeoOutput>(
      network,
      'com.para.civic.getCabildeo',
      { cabildeo: cabildeo.uri },
      bob,
    )
    expect(detail.cabildeo.liveSession?.activeParticipantCount).toBe(2)

    const profile = await agent.api.app.bsky.actor.getProfile(
      { actor: dan },
      {
        headers: await network.serviceHeaders(bob, ids.AppBskyActorGetProfile),
      },
    )
    expect(profile.data.cabildeoLive).toEqual(
      expect.objectContaining({
        cabildeoUri: cabildeo.uri,
        community: 'mx-live',
        phase: 'open',
      }),
    )

    const profiles = await agent.api.app.bsky.actor.getProfiles(
      { actors: [dan] },
      {
        headers: await network.serviceHeaders(bob, ids.AppBskyActorGetProfiles),
      },
    )
    expect(profiles.data.profiles[0]?.cabildeoLive?.cabildeoUri).toBe(
      cabildeo.uri,
    )
  })

  it('boosts live cabildeos ahead of non-live cabildeos within a community', async () => {
    const liveCabildeo = await createCabildeoRecord(sc, alice, {
      title: 'Live-first cabildeo',
      description: 'Should rank ahead while live',
      community: 'mx-live-ranking',
      phase: 'open',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    const newerNonLive = await createCabildeoRecord(sc, alice, {
      title: 'Newer non-live cabildeo',
      description: 'Would normally sort first',
      community: 'mx-live-ranking',
      phase: 'open',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    await createLiveStatusRecord(sc, alice, {
      uri: 'https://live.example.com/cabildeo/ranking',
    })
    await network.processAll()

    await callParaProcedure(
      network,
      'com.para.civic.putLivePresence',
      {
        cabildeo: liveCabildeo.uri,
        sessionId: 'alice-live-ranking',
      },
      alice,
    )

    const listed = await callPara<ParaListCabildeosOutput>(
      network,
      'com.para.civic.listCabildeos',
      { community: 'mx-live-ranking', limit: 10 },
      bob,
    )
    expect(listed.cabildeos[0]?.uri).toBe(liveCabildeo.uri)
    expect(listed.cabildeos.map((item) => item.uri)).toContain(newerNonLive.uri)
  })

  it('expires live cabildeo presence without cleanup and respects generic live precedence', async () => {
    const cabildeo = await createCabildeoRecord(sc, alice, {
      title: 'Expiring live cabildeo',
      description: 'Presence should expire',
      community: 'mx-live-expiring',
      phase: 'open',
      options: [{ label: 'Yes' }, { label: 'No' }],
    })
    await createLiveStatusRecord(sc, alice, {
      uri: 'https://live.example.com/cabildeo/shared',
    })
    await createLiveStatusRecord(sc, bob, {
      uri: 'https://live.example.com/other-room',
    })
    await network.processAll()

    await callParaProcedure(
      network,
      'com.para.civic.putLivePresence',
      {
        cabildeo: cabildeo.uri,
        sessionId: 'alice-session-expiring',
      },
      alice,
    )
    await callParaProcedure(
      network,
      'com.para.civic.putLivePresence',
      {
        cabildeo: cabildeo.uri,
        sessionId: 'bob-session-expiring',
      },
      bob,
    )

    const bobGenericLive = await agent.api.app.bsky.actor.getProfile(
      { actor: bob },
      {
        headers: await network.serviceHeaders(
          alice,
          ids.AppBskyActorGetProfile,
        ),
      },
    )
    expect(bobGenericLive.data.status?.isActive).toBe(true)
    expect(bobGenericLive.data.cabildeoLive).toBeUndefined()

    await createLiveStatusRecord(sc, bob, {
      uri: 'https://live.example.com/cabildeo/shared',
    })
    await network.processAll()

    const bobMatchedLive = await agent.api.app.bsky.actor.getProfile(
      { actor: bob },
      {
        headers: await network.serviceHeaders(
          alice,
          ids.AppBskyActorGetProfile,
        ),
      },
    )
    expect(bobMatchedLive.data.cabildeoLive?.cabildeoUri).toBe(cabildeo.uri)

    await network.bsky.db.db
      .updateTable('cabildeo_live_presence')
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where('cabildeo', '=', cabildeo.uri)
      .execute()

    const listed = await callPara<ParaListCabildeosOutput>(
      network,
      'com.para.civic.listCabildeos',
      { community: 'mx-live-expiring', limit: 10 },
      alice,
    )
    expect(listed.cabildeos[0]?.liveSession).toBeUndefined()

    const expiredProfile = await agent.api.app.bsky.actor.getProfile(
      { actor: bob },
      {
        headers: await network.serviceHeaders(
          alice,
          ids.AppBskyActorGetProfile,
        ),
      },
    )
    expect(expiredProfile.data.cabildeoLive).toBeUndefined()
  })

  it('filters blocked participants out of live preview dids', async () => {
    const cabildeo = await createCabildeoRecord(sc, alice, {
      title: 'Blocked preview filtering',
      description: 'Preview should hide blocked users',
      community: 'mx-live-blocks',
      phase: 'open',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    await createLiveStatusRecord(sc, alice, {
      uri: 'https://live.example.com/cabildeo/blocked',
    })
    await network.processAll()

    await callParaProcedure(
      network,
      'com.para.civic.putLivePresence',
      {
        cabildeo: cabildeo.uri,
        sessionId: 'alice-blocked-preview',
      },
      alice,
    )
    await callParaProcedure(
      network,
      'com.para.civic.putLivePresence',
      {
        cabildeo: cabildeo.uri,
        sessionId: 'bob-blocked-preview',
      },
      bob,
    )
    await sc.block(dan, bob)
    await network.processAll()

    const detail = await callPara<ParaGetCabildeoOutput>(
      network,
      'com.para.civic.getCabildeo',
      { cabildeo: cabildeo.uri },
      dan,
    )
    expect(detail.cabildeo.liveSession?.participantPreviewDids).toContain(alice)
    expect(detail.cabildeo.liveSession?.participantPreviewDids).not.toContain(
      bob,
    )
  })

  it('rejects live presence for draft cabildeos', async () => {
    const cabildeo = await createCabildeoRecord(sc, alice, {
      title: 'Draft cabildeo',
      description: 'Should not allow live presence',
      community: 'mx-live-draft',
      phase: 'draft',
      options: [{ label: 'A' }, { label: 'B' }],
    })
    await createLiveStatusRecord(sc, alice, {
      uri: 'https://live.example.com/cabildeo/draft',
    })
    await network.processAll()

    const url = new URL(
      '/xrpc/com.para.civic.putLivePresence',
      network.bsky.url,
    )
    const authHeaders = await network.serviceHeaders(
      alice,
      'com.para.civic.putLivePresence',
    )
    const res = await request(url, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        cabildeo: cabildeo.uri,
        sessionId: 'draft-session',
      }),
    })

    expect(res.statusCode).toBe(400)
    expect((await res.body.json())?.error).toBe('InvalidPhase')
  })
})

const callPara = async <T>(
  network: TestNetwork,
  nsid: string,
  params: Record<string, string | number | string[] | undefined>,
  did?: string,
): Promise<T> => {
  const res = await callParaRaw(network, nsid, params, did)
  if (res.status !== 200) {
    throw new Error(
      `Expected ${nsid} to return 200, got ${res.status}: ${JSON.stringify(
        res.body,
      )}`,
    )
  }
  return res.body as T
}

const callParaRaw = async (
  network: TestNetwork,
  nsid: string,
  params: Record<string, string | number | string[] | undefined>,
  did?: string,
) => {
  const url = new URL(`/xrpc/${nsid}`, network.bsky.url)
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'undefined') continue
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item)
      }
      continue
    }
    url.searchParams.set(key, String(value))
  }

  const headers = did ? await network.serviceHeaders(did, nsid) : undefined
  const res = await request(url, { headers })
  return {
    status: res.statusCode,
    body: await res.body.json(),
  }
}

const createNullifiedCabildeoVoteRecord = async (
  sc: SeedClient,
  by: string,
  opts: {
    cabildeo: string
    selectedOption: number
    isDirect: boolean
    voteNullifier: string
    eligibilityProofRef: string
  },
) => {
  const { data } = await sc.agent.com.atproto.repo.createRecord(
    {
      repo: by,
      collection: 'com.para.civic.vote',
      record: {
        $type: 'com.para.civic.vote',
        subject: opts.cabildeo,
        subjectType: 'cabildeo',
        cabildeo: opts.cabildeo,
        selectedOption: opts.selectedOption,
        isDirect: opts.isDirect,
        voteNullifier: opts.voteNullifier,
        eligibilityProofRef: opts.eligibilityProofRef,
        createdAt: new Date().toISOString(),
      },
    },
    {
      encoding: 'application/json',
      headers: sc.getHeaders(by),
    },
  )

  return { uri: data.uri, cid: data.cid }
}

const callParaProcedure = async <T>(
  network: TestNetwork,
  nsid: string,
  body: Record<string, unknown>,
  did: string,
): Promise<T> => {
  const url = new URL(`/xrpc/${nsid}`, network.bsky.url)
  const authHeaders = await network.serviceHeaders(did, nsid)
  const res = await request(url, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const responseBody = await res.body.json()
  if (res.statusCode !== 200) {
    throw new Error(
      `Expected ${nsid} to return 200, got ${
        res.statusCode
      }: ${JSON.stringify(responseBody)}`,
    )
  }
  return responseBody as T
}
