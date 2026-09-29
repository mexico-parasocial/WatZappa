import { afterAll, beforeAll, expect, it } from 'vitest'
import { TestNetwork, seedDemoMemes } from '@atproto/dev-env'
import { Client } from '@atproto/lex'
import { app, com } from '../../src/lexicons/index.js'

let network: TestNetwork
let client: Client

beforeAll(async () => {
  const schemaSuffix = String(process.pid).replace(/\d/g, (digit) =>
    String.fromCharCode(97 + Number(digit)),
  )
  network = await TestNetwork.create({
    dbPostgresSchema: `bsky_para_memes_${schemaSuffix}`,
  })
  const sc = network.getSeedClient()
  await sc.createAccount('memes', {
    handle: 'memes.test',
    email: 'memes@test.com',
    password: 'memes-password',
  })
  const agent = network.pds.getAgent()
  await agent.login({ identifier: 'memes.test', password: 'memes-password' })
  await seedDemoMemes(agent)
  await network.processAll()
  await seedDemoMemes(agent)
  await network.processAll()
  client = new Client(network.bsky.url)
})

afterAll(async () => network?.close())

it('hydrates PARA image memes and keeps repeat seeding idempotent', async () => {
  const result = await client.call(com.para.feed.getMemes, { limit: 25 })
  expect(result.feed).toHaveLength(8)
  for (const { post } of result.feed) {
    expect(post.uri).toContain('/com.para.post/')
    expect(com.para.post.$matches(post.record)).toBe(true)
    expect(app.bsky.embed.images.view.$matches(post.embed)).toBe(true)
    const embed = app.bsky.embed.images.view.$validate(post.embed)
    expect(embed.images[0].fullsize).toContain('/img/')
  }
})

it('does not discard normal Bluesky posts when hydrating PARA posts', async () => {
  const agent = network.pds.getAgent()
  await agent.login({ identifier: 'memes.test', password: 'memes-password' })
  const { uri } = await agent.post({ text: 'A normal post' })
  await network.processAll()
  const result = await client.call(app.bsky.feed.getPosts, { uris: [uri] })
  expect(result.posts).toHaveLength(1)
  expect(app.bsky.feed.post.$matches(result.posts[0].record)).toBe(true)
})
