import './env.js'
import { buildDevEnvRuntimeConfig } from './config.js'
import { createDevEnvManifest } from './manifest.js'
import { generateMinimalMockSetup } from './mock/minimal.js'
import { TestNetwork } from './network.js'
import { createParaFeedGens, paraDemoSeed } from './seed/index.js'
import { mockMailer } from './util.js'

const run = async () => {
  console.log(`
██████╗
██╔═══██╗
██║██╗██║
██║██║██║
╚█║████╔╝
 ╚╝╚═══╝  protocol

[ created by Bluesky ]`)

  const runtimeConfig = buildDevEnvRuntimeConfig()
  const network = await TestNetwork.create(runtimeConfig.networkParams)
  network.manifest = createDevEnvManifest(network, runtimeConfig)
  mockMailer(network.pds)

  if (network.introspect) {
    console.log(
      `🔍 Dev-env introspection server http://localhost:${network.introspect.port}`,
    )
  }
  console.log(`👤 DID Placeholder server http://localhost:${network.plc.port}`)
  console.log(`🌞 Main PDS http://localhost:${network.pds.port}`)
  console.log(`🌞 Main PDS account DB`, network.pds.ctx.cfg.db.accountDbLoc)
  console.log(
    `🔨 Lexicon authority DID ${network.pds.ctx.cfg.lexicon.didAuthority}`,
  )
  console.log(`🗼 Ozone server http://localhost:${network.ozone.port}`)
  console.log(`🗼 Ozone service DID ${network.ozone.ctx.cfg.service.did}`)
  console.log(`💬 Chat service http://localhost:${network.chat.port}`)
  console.log(`💬 Chat service DID ${network.chat.did}`)
  console.log(`🌅 Bsky Appview http://localhost:${network.bsky.port}`)
  console.log(`🌅 Bsky Appview DID ${network.bsky.serverDid}`)
  for (const fg of network.feedGens) {
    console.log(`🤖 Feed Generator (${fg.did}) http://localhost:${fg.port}`)
  }

  if (!runtimeConfig.skipMockSetup) {
    await generateMinimalMockSetup(network)
  }

  if (!runtimeConfig.skipParaDemoSeed) {
    const sc = network.getSeedClient()
    const seedData = await paraDemoSeed(sc)
    await createParaFeedGens(network, seedData)
  }

  console.log('✅ Dev environment is ready')
  console.log(`📋 DevEnv manifest ${JSON.stringify(network.manifest, null, 2)}`)
}

run()
