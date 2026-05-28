/* eslint-env node */

'use strict'

const assert = require('node:assert')
const cluster = require('node:cluster')
const path = require('node:path')

const { BskyAppView, ServerConfig } = require('@atproto/bsky')
const { Secp256k1Keypair } = require('@atproto/crypto')

const main = async () => {
  const env = getEnv()
  const config = ServerConfig.readEnv()
  assert(env.serviceSigningKey, 'must set BSKY_SERVICE_SIGNING_KEY')
  const signingKey = await Secp256k1Keypair.import(env.serviceSigningKey)
  const bsky = BskyAppView.create({ config, signingKey })
  await bsky.start()
  // Graceful shutdown (see also https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/)
  const shutdown = async () => {
    await bsky.destroy()
  }
  process.on('SIGTERM', shutdown)
  process.on('disconnect', shutdown) // when clustering
}

const getEnv = () => ({
  serviceSigningKey: process.env.BSKY_SERVICE_SIGNING_KEY || undefined,
})

const maybeParseInt = (str) => {
  if (!str) return
  const int = parseInt(str, 10)
  if (isNaN(int)) return
  return int
}

const workerCount = maybeParseInt(process.env.CLUSTER_WORKER_COUNT)

if (workerCount) {
  if (cluster.isPrimary) {
    console.log(`primary ${process.pid} is running`)
    const workers = new Set()
    for (let i = 0; i < workerCount; ++i) {
      workers.add(cluster.fork())
    }
    let teardown = false
    cluster.on('exit', (worker) => {
      workers.delete(worker)
      if (!teardown) {
        workers.add(cluster.fork()) // restart on crash
      }
    })
    process.on('SIGTERM', () => {
      teardown = true
      console.log('disconnecting workers')
      workers.forEach((w) => w.disconnect())
    })
  } else {
    console.log(`worker ${process.pid} is running`)
    main()
  }
} else {
  main() // non-clustering
}
