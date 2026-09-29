import { AtpAgent } from '@atproto/api'
import { seedDemoMemes } from './seed/para-memes.js'

const service = process.env.SEED_PDS_URL ?? 'http://127.0.0.1:2583'
const agent = new AtpAgent({ service })
await agent.login({
  identifier: process.env.SEED_IDENTIFIER ?? 'alice.test',
  password: process.env.SEED_PASSWORD ?? 'hunter2',
})
await seedDemoMemes(agent)
