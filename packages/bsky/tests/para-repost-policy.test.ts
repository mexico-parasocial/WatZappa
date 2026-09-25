import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REPOST_COLLECTION, TID, cidForCbor } from '@atproto/common'
import { type SeedClient, TestNetwork, usersSeed } from '@atproto/dev-env'
import { WriteOpAction } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'
import { up as dropParaReposts } from '../src/data-plane/server/db/migrations/20260925T120000000Z-drop-para-reposts.js'

const maybeDescribe = process.env.DB_POSTGRES_URL ? describe : describe.skip

// PARA has no reposts (@atproto/common para-repost-policy.ts). Reposts
// indexed before the policy are removed by a migration, reposts reaching the
// AppView from any PDS are not indexed, and a like made "via" a repost does
// not notify a reposter.
maybeDescribe('PARA repost policy (AppView)', () => {
  const previous = process.env.PARA_REPOSTS_ENABLED
  let network: TestNetwork
  let sc: SeedClient
  let alice: string
  let bob: string
  let carol: string
  let post: { uri: string; cid: string }

  const db = () => network.bsky.db.db

  const repostRows = async () =>
    db()
      .selectFrom('repost')
      .where('subject', '=', post.uri)
      .select('uri')
      .execute()

  const repostNotifs = async () =>
    db()
      .selectFrom('notification')
      .where('reason', 'in', ['repost', 'repost-via-repost', 'like-via-repost'])
      .select('reason')
      .execute()

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'para_repost_policy_test',
    })
    sc = network.getSeedClient()
    await usersSeed(sc)
    alice = sc.dids.alice
    bob = sc.dids.bob
    carol = sc.dids.carol
    const created = await sc.post(alice, 'a post to share')
    post = { uri: created.ref.uriStr, cid: created.ref.cidStr }
    await network.processAll()
  })

  afterAll(async () => {
    await network.close()
    if (previous === undefined) delete process.env.PARA_REPOSTS_ENABLED
    else process.env.PARA_REPOSTS_ENABLED = previous
  })

  it('the migration removes reposts indexed before the policy', async () => {
    // Index a repost, and a like via it, the way an older AppView did.
    process.env.PARA_REPOSTS_ENABLED = '1'
    const repost = await sc.repost(bob, sc.posts[alice].at(-1)!.ref)
    await sc.agent.com.atproto.repo.createRecord(
      {
        repo: carol,
        collection: 'app.bsky.feed.like',
        record: {
          subject: post,
          via: { uri: repost.uriStr, cid: repost.cidStr },
          createdAt: new Date().toISOString(),
        },
      },
      { encoding: 'application/json', headers: sc.getHeaders(carol) },
    )
    await network.processAll()
    expect(await repostRows()).toHaveLength(1)
    expect((await repostNotifs()).map((n) => n.reason).sort()).toEqual([
      'like-via-repost',
      'repost',
    ])

    process.env.PARA_REPOSTS_ENABLED = '0'
    await dropParaReposts(db())

    expect(await repostRows()).toHaveLength(0)
    expect(await repostNotifs()).toHaveLength(0)
    const feedItems = await db()
      .selectFrom('feed_item')
      .where('type', '=', 'repost')
      .select('uri')
      .execute()
    expect(feedItems).toHaveLength(0)
    const agg = await db()
      .selectFrom('post_agg')
      .where('uri', '=', post.uri)
      .select('repostCount')
      .executeTakeFirst()
    expect(Number(agg?.repostCount ?? 0)).toBe(0)
    // Likes are kept; only the repost-derived notification goes.
    const likes = await db()
      .selectFrom('like')
      .where('subject', '=', post.uri)
      .select('uri')
      .execute()
    expect(likes).toHaveLength(1)
  })

  it('does not index a repost reaching it from another PDS', async () => {
    process.env.PARA_REPOSTS_ENABLED = '0'
    const record = {
      $type: REPOST_COLLECTION,
      subject: post,
      createdAt: new Date().toISOString(),
    }
    await network.bsky.sub.indexingSvc.indexRecord(
      AtUri.make(bob, REPOST_COLLECTION, TID.nextStr()),
      await cidForCbor(record),
      record,
      WriteOpAction.Create,
      record.createdAt,
    )
    expect(await repostRows()).toHaveLength(0)
    expect(await repostNotifs()).toHaveLength(0)
  })

  it('does not notify a reposter for a like made via a repost', async () => {
    process.env.PARA_REPOSTS_ENABLED = '0'
    const record = {
      $type: 'app.bsky.feed.like',
      subject: post,
      via: {
        uri: `at://${bob}/${REPOST_COLLECTION}/${TID.nextStr()}`,
        cid: post.cid,
      },
      createdAt: new Date().toISOString(),
    }
    await network.bsky.sub.indexingSvc.indexRecord(
      AtUri.make(carol, 'app.bsky.feed.like', TID.nextStr()),
      await cidForCbor(record),
      record,
      WriteOpAction.Create,
      record.createdAt,
    )
    expect(await repostNotifs()).toHaveLength(0)
    const likeNotifs = await db()
      .selectFrom('notification')
      .where('reason', '=', 'like')
      .where('reasonSubject', '=', post.uri)
      .select('author')
      .execute()
    expect(likeNotifs.map((n) => n.author)).toContain(carol)
  })
})
