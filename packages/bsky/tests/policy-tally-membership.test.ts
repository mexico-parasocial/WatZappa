import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TID, cidForCbor } from '@atproto/common'
import {
  type SeedClient,
  TestNetwork,
  createCommunityBoardRecord,
  createCommunityMembershipRecord,
  createParaPost,
  createParaPostMeta,
  usersSeed,
} from '@atproto/dev-env'
import { WriteOpAction } from '@atproto/repo'
import { AtUri, type DidString } from '@atproto/syntax'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

// A community policy counts only ballots from the community's active members
// (OD-10 §7.7), judged per identity when the tally is read and by the same
// rule as a cabildeo's (`filterActiveMembers`). These pin that an outsider's
// ballot never counts, that a member who leaves stops counting, and that the
// quorum's denominator is judged the same way as its numerator.
maybeDescribe('policy tally membership', () => {
  let network: TestNetwork
  let sc: SeedClient
  let alice: DidString // member by authority events
  let bob: DidString // member by his own membership record (legacy)
  let dan: DidString // outsider
  let boardUri: string
  let boardSlug: string

  const tally = async (postUri: string) =>
    (await network.bsky.ctx.dataplane.getParaPolicyTally({ postUri })).tally!

  const communityVotes = (postUri: string) =>
    network.bsky.ctx.dataplane.getParaPolicyCommunityVotes({
      communityId: boardUri,
      postUri,
      viewerDid: alice,
      viewerIsAdmin: false,
      limit: 50,
    })

  const vote = async (did: DidString, subject: string, signal: number) => {
    const record = {
      $type: 'com.para.civic.vote',
      subject,
      subjectType: 'policy',
      signal,
      isDirect: true,
      // One person per voter: each needs a nullifier of their own.
      voteNullifier: randomUUID().replaceAll('-', '').repeat(2),
      eligibilityProofRef: 'm8:policy:v1:' + 'f'.repeat(43),
      createdAt: new Date().toISOString(),
    }
    const previousUrl = process.env.PARA_CIVIC_VOTE_VERIFIER_URL
    process.env.PARA_CIVIC_VOTE_VERIFIER_URL = 'https://issuer.test/verify'
    using _verifier = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))
    try {
      await network.bsky.sub.indexingSvc.indexRecord(
        AtUri.make(did, 'com.para.civic.vote', TID.nextStr()),
        await cidForCbor(record),
        record,
        WriteOpAction.Create,
        new Date().toISOString(),
      )
    } finally {
      if (previousUrl === undefined)
        delete process.env.PARA_CIVIC_VOTE_VERIFIER_URL
      else process.env.PARA_CIVIC_VOTE_VERIFIER_URL = previousUrl
    }
  }

  const policy = async (text: string, official = false) => {
    const post = await createParaPost(sc, alice, text, { postType: 'policy' })
    await createParaPostMeta(sc, alice, post.uri, {
      postType: 'policy',
      voteScore: 0,
      community: boardSlug,
      official,
    })
    await network.processAll()
    return post.uri
  }

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'policy_tally_membership_test',
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    ;({ alice, bob, dan } = sc.dids)

    boardUri = (
      await createCommunityBoardRecord(sc, alice, {
        name: 'Policy Tally Board',
        quadrant: 'center',
      })
    ).uri
    await network.processAll()
    await sc.agent.com.atproto.repo.createRecord(
      {
        repo: alice,
        collection: 'com.para.community.authorityEvent',
        record: {
          $type: 'com.para.community.authorityEvent',
          community: boardUri,
          subject: alice,
          issuer: alice,
          action: 'member.activate',
          basis: 'foundingTransition',
          version: 1,
          effectiveAt: new Date(Date.now() - 1000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(alice) },
    )
    await createCommunityMembershipRecord(sc, bob, boardUri, 'active')
    await network.processAll()

    const row = await network.bsky.db.db
      .selectFrom('para_community_board')
      .where('uri', '=', boardUri)
      .select('slug')
      .executeTakeFirstOrThrow()
    boardSlug = row.slug as string
  })

  afterAll(async () => {
    await network?.close()
  })

  it('counts members and never an outsider', async () => {
    const subject = await policy('Members only')
    await vote(alice, subject, 3)
    await vote(bob, subject, 1)
    await vote(dan, subject, -3)

    const result = await tally(subject)
    expect(result).toMatchObject({
      voteCount: 2,
      directVoteCount: 2,
      signalSum: 4,
      eligibleVoterCount: 2,
      // Capped at the electorate: two members can reach their own quorum.
      quorumTarget: 2,
      quorumMet: true,
      outcome: 'strong_passed',
      // A live reading (OD-10 §7.6), not a certified decision.
      state: 'passing',
      certified: true,
      official: false,
    })
    expect(
      result.breakdown
        .filter((bucket) => bucket.count > 0)
        .map(({ signal, count }) => ({ signal, count })),
    ).toEqual([
      { signal: 1, count: 1 },
      { signal: 3, count: 1 },
    ])

    const view = await communityVotes(subject)
    expect(view).toMatchObject({ memberCount: 2, voterCount: 2 })
    expect(view.votes.map((v) => v.did).sort()).toEqual([alice, bob].sort())
  })

  it('reads a policy live, whatever its author claims (OD-10 §7.6)', async () => {
    // The author's own post metadata says "official": it changes nothing.
    const subject = await policy('Claimed official', true)
    await vote(alice, subject, -2)
    await vote(bob, subject, -1)
    expect(await tally(subject)).toMatchObject({
      outcome: 'failed',
      state: 'failing',
      official: false,
      certified: false,
    })

    const split = await policy('Split')
    await vote(alice, split, 1)
    await vote(bob, split, -1)
    expect(await tally(split)).toMatchObject({
      outcome: 'contested',
      state: 'split',
    })

    const quiet = await policy('Nobody yet')
    expect(await tally(quiet)).toMatchObject({
      voteCount: 0,
      outcome: 'insufficient_quorum',
      state: 'noQuorum',
    })
  })

  it('never counts a neutral ballot (OD-10 §7.5)', async () => {
    const subject = await policy('No neutral ballot')
    await vote(alice, subject, 2)
    // Refused when indexed: the shared ballot rule has no 0.
    await vote(bob, subject, 0)
    const indexed = await network.bsky.db.db
      .selectFrom('para_policy_vote')
      .where('subject', '=', subject)
      .select('creator')
      .execute()
    expect(indexed.map((row) => row.creator)).toEqual([alice])

    // One indexed before the rule changed stays as history and is not counted.
    const now = new Date().toISOString()
    await network.bsky.db.db
      .insertInto('para_policy_vote')
      .values({
        uri: AtUri.make(bob, 'com.para.civic.vote', TID.nextStr()).toString(),
        cid: (await cidForCbor({ legacy: true })).toString(),
        creator: bob,
        subject,
        subjectType: 'policy',
        signal: 0,
        isDirect: 1,
        delegatedFrom: null,
        voteNullifier: 'legacy-neutral',
        eligibilityProofRef: null,
        reason: null,
        createdAt: now,
        indexedAt: now,
      })
      .execute()

    const result = await tally(subject)
    expect(result).toMatchObject({ voteCount: 1, signalSum: 2 })
    expect(result.breakdown.map((bucket) => bucket.signal)).toEqual([
      -3, -2, -1, 1, 2, 3,
    ])
    const view = await communityVotes(subject)
    expect(view).toMatchObject({ voterCount: 1 })
    expect(view.breakdown.map((bucket) => bucket.signal)).toEqual([2])
  })

  it('stops counting a member who leaves', async () => {
    const subject = await policy('Leaving')
    await vote(alice, subject, 2)
    await vote(bob, subject, 2)
    expect(await tally(subject)).toMatchObject({ voteCount: 2 })

    const membership = await network.bsky.db.db
      .selectFrom('para_community_membership')
      .where('creator', '=', bob)
      .where('communityUri', '=', boardUri)
      .select('uri')
      .executeTakeFirstOrThrow()
    await sc.agent.com.atproto.repo.putRecord(
      {
        repo: bob,
        collection: 'com.para.community.membership',
        rkey: new AtUri(membership.uri).rkey,
        record: {
          $type: 'com.para.community.membership',
          community: boardUri,
          membershipState: 'left',
          joinedAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(bob) },
    )
    await network.processAll()

    expect(await tally(subject)).toMatchObject({
      voteCount: 1,
      signalSum: 2,
      eligibleVoterCount: 1,
    })
    expect(await communityVotes(subject)).toMatchObject({
      memberCount: 1,
      voterCount: 1,
    })
  })
})
