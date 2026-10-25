import type { AtpAgent } from '@atproto/api'
import { REPOST_COLLECTION } from '@atproto/common'
import { TestNetworkNoAppView } from '@atproto/dev-env'

// @NOTE the refusal text lives in @atproto/common (para-repost-policy.ts).
const NOT_SUPPORTED = /is not supported on PARA/

describe('PARA repost policy', () => {
  const previous = process.env.PARA_REPOSTS_ENABLED
  let network: TestNetworkNoAppView
  let agent: AtpAgent
  let did: string
  let post: { uri: string; cid: string }

  const repostRecord = () => ({
    $type: REPOST_COLLECTION,
    subject: post,
    createdAt: new Date().toISOString(),
  })

  beforeAll(async () => {
    // Behave like a PARA deployment rather than the upstream test default.
    process.env.PARA_REPOSTS_ENABLED = '0'
    network = await TestNetworkNoAppView.create({})
    agent = network.pds.getAgent()
    const { data } = await agent.createAccount({
      email: 'sharer@test.com',
      handle: 'sharer.test',
      password: 'sharer-pass',
    })
    did = data.did
    const created = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: 'app.bsky.feed.post',
      record: { text: 'original', createdAt: new Date().toISOString() },
    })
    post = { uri: created.data.uri, cid: created.data.cid }
  })

  afterAll(async () => {
    await network?.close()
    if (previous === undefined) delete process.env.PARA_REPOSTS_ENABLED
    else process.env.PARA_REPOSTS_ENABLED = previous
  })

  it('refuses to create a repost', async () => {
    const attempt = agent.com.atproto.repo.createRecord({
      repo: did,
      collection: REPOST_COLLECTION,
      record: repostRecord(),
    })
    await expect(attempt).rejects.toThrow(NOT_SUPPORTED)
  })

  it('refuses a repost inside applyWrites and writes nothing', async () => {
    const attempt = agent.com.atproto.repo.applyWrites({
      repo: did,
      writes: [
        {
          $type: 'com.atproto.repo.applyWrites#create',
          collection: 'app.bsky.feed.post',
          value: { text: 'alongside', createdAt: new Date().toISOString() },
        },
        {
          $type: 'com.atproto.repo.applyWrites#create',
          collection: REPOST_COLLECTION,
          value: repostRecord(),
        },
      ],
    })
    await expect(attempt).rejects.toThrow(NOT_SUPPORTED)
    const { data } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: 'app.bsky.feed.post',
    })
    expect(data.records).toHaveLength(1)
  })

  it('still accepts a quote post, the PARA way to share', async () => {
    const { data } = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: 'app.bsky.feed.post',
      record: {
        text: 'quoting',
        embed: { $type: 'app.bsky.embed.record', record: post },
        createdAt: new Date().toISOString(),
      },
    })
    expect(data.uri).toContain('app.bsky.feed.post')
  })

  it('still deletes a repost written before the policy', async () => {
    process.env.PARA_REPOSTS_ENABLED = '1'
    const old = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: REPOST_COLLECTION,
      record: repostRecord(),
    })
    process.env.PARA_REPOSTS_ENABLED = '0'
    const rkey = old.data.uri.split('/').pop()!
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: REPOST_COLLECTION,
      rkey,
    })
    const { data } = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: REPOST_COLLECTION,
    })
    expect(data.records).toHaveLength(0)
  })
})
