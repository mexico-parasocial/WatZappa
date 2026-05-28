import { AtpAgent } from '@atproto/api'
import { RecordRef, SeedClient, TestNetwork, usersSeed } from '@atproto/dev-env'

describe('post subscriptions', () => {
  let network: TestNetwork
  let agent: AtpAgent
  let sc: SeedClient

  let alice: string
  let bob: string
  let carol: string

  beforeAll(async () => {
    network = await TestNetwork.create({
      dbPostgresSchema: 'bsky_post_subscriptions',
    })
    sc = network.getSeedClient()
    agent = network.bsky.getAgent()
    await usersSeed(sc)
    alice = sc.dids.alice
    bob = sc.dids.bob
    carol = sc.dids.carol
  })

  afterAll(async () => {
    await network.close()
  })

  beforeEach(async () => {
    await network.bsky.db.db.deleteFrom('notification').execute()
    await network.bsky.db.db.deleteFrom('post_subscription').execute()
  })

  const subscribe = async (
    actor: string,
    post: RecordRef,
    opts: { reply: boolean; quote: boolean },
  ) =>
    agent.com.para.notification.putPostSubscription(
      {
        post: post.uriStr,
        reply: opts.reply,
        quote: opts.quote,
      },
      {
        headers: await network.serviceHeaders(
          actor,
          'com.para.notification.putPostSubscription',
        ),
      },
    )

  const subscribedNotifs = async (actor: string) => {
    const res = await agent.api.app.bsky.notification.listNotifications(
      {},
      {
        headers: await network.serviceHeaders(
          actor,
          'app.bsky.notification.listNotifications',
        ),
      },
    )
    return res.data.notifications.filter(
      (notif) => notif.reason === 'subscribed-post',
    )
  }

  it('notifies subscribers about replies below the followed post', async () => {
    const root = (await sc.post(bob, 'root post')).ref
    await network.processAll()
    await subscribe(alice, root, { reply: true, quote: true })

    const reply = await sc.reply(carol, root, root, 'reply')
    await network.processAll()

    expect(await subscribedNotifs(alice)).toEqual([
      expect.objectContaining({
        uri: reply.ref.uriStr,
        reason: 'subscribed-post',
        reasonSubject: root.uriStr,
      }),
    ])
  })

  it('notifies subscribers about quotes of the followed post', async () => {
    const root = (await sc.post(bob, 'root post')).ref
    await network.processAll()
    await subscribe(alice, root, { reply: true, quote: true })

    const quote = await sc.post(carol, 'quote', undefined, undefined, root)
    await network.processAll()

    expect(await subscribedNotifs(alice)).toEqual([
      expect.objectContaining({
        uri: quote.ref.uriStr,
        reason: 'subscribed-post',
        reasonSubject: root.uriStr,
      }),
    ])
  })

  it('respects reply-only subscriptions', async () => {
    const root = (await sc.post(bob, 'root post')).ref
    await network.processAll()
    await subscribe(alice, root, { reply: true, quote: false })

    await sc.post(carol, 'quote', undefined, undefined, root)
    await network.processAll()

    expect(await subscribedNotifs(alice)).toHaveLength(0)
  })

  it('respects quote-only subscriptions', async () => {
    const root = (await sc.post(bob, 'root post')).ref
    await network.processAll()
    await subscribe(alice, root, { reply: false, quote: true })

    await sc.reply(carol, root, root, 'reply')
    await network.processAll()

    expect(await subscribedNotifs(alice)).toHaveLength(0)
  })

  it('does not notify the actor who created the reply or quote', async () => {
    const root = (await sc.post(bob, 'root post')).ref
    await network.processAll()
    await subscribe(alice, root, { reply: true, quote: true })

    await sc.reply(alice, root, root, 'self reply')
    await sc.post(alice, 'self quote', undefined, undefined, root)
    await network.processAll()

    expect(await subscribedNotifs(alice)).toHaveLength(0)
  })

  it('does not duplicate the normal notification for the followed post author', async () => {
    const root = (await sc.post(bob, 'root post')).ref
    await network.processAll()
    await subscribe(bob, root, { reply: true, quote: true })

    await sc.reply(carol, root, root, 'reply')
    await sc.post(carol, 'quote', undefined, undefined, root)
    await network.processAll()

    const res = await agent.api.app.bsky.notification.listNotifications(
      {},
      {
        headers: await network.serviceHeaders(
          bob,
          'app.bsky.notification.listNotifications',
        ),
      },
    )
    expect(
      res.data.notifications.filter(
        (notif) => notif.reason === 'subscribed-post',
      ),
    ).toHaveLength(0)
    expect(res.data.notifications.map((notif) => notif.reason).sort()).toEqual([
      'quote',
      'reply',
    ])
  })

  it('uses the existing thread mute filter for subscribed-post notifications', async () => {
    const root = (await sc.post(bob, 'root post')).ref
    await network.processAll()
    await subscribe(alice, root, { reply: true, quote: true })
    await agent.api.app.bsky.graph.muteThread(
      { root: root.uriStr },
      {
        headers: await network.serviceHeaders(
          alice,
          'app.bsky.graph.muteThread',
        ),
      },
    )

    await sc.reply(carol, root, root, 'reply')
    await sc.post(carol, 'quote', undefined, undefined, root)
    await network.processAll()

    expect(await subscribedNotifs(alice)).toHaveLength(0)
  })
})
