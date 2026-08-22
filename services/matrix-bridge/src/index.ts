import { createServer } from 'node:http'
import pino from 'pino'
import { ChatModerationEngine } from './chat-moderation.js'
import { loadConfig } from './config.js'
import { createDatabase } from './db/index.js'
import { FirehoseConsumer } from './firehose.js'
import { HttpError } from './m8-auth.js'
import { MatrixSyncPoller } from './matrix-sync.js'
import { MatrixAdminClient } from './matrix.js'
import { BridgeMetrics } from './metrics.js'
import { ProposalEngine } from './proposals.js'
import { RetryWorker } from './retry.js'
import { createSortitionEngine } from './sortition-runs.js'
import { routeRequest, writeJsonFallback } from './routes/router.js'
import { writeJson } from './routes/http.js'
import type { RouteContext } from './routes/context.js'

async function main() {
  const config = loadConfig()

  const log = pino({
    level: config.logLevel,
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  })

  log.info('Matrix↔PARA Community Bridge starting...')

  const db = createDatabase(config)

  // F4: reports no longer capture an excerpt of the reported message. Clear any
  // captured by earlier versions before serving a request that could read them.
  const purged = await db.purgeReportedMessagePreviews()
  if (purged > 0) {
    log.warn(
      { rows: purged },
      'Purged stored message excerpts from moderation reports (F4)',
    )
  }

  const matrix = new MatrixAdminClient(config)
  const metrics = new BridgeMetrics()
  const firehose = new FirehoseConsumer(config, db, matrix, metrics, log)
  const chatMod = new ChatModerationEngine(db, log)
  const proposals = new ProposalEngine(db, matrix, log, chatMod)
  const retryWorker = new RetryWorker(db, matrix, metrics, log)
  const syncPoller = new MatrixSyncPoller(config, db, matrix, chatMod, log)
  const sortition = createSortitionEngine(db, log)

  const ctx: RouteContext = {
    config,
    db,
    matrix,
    metrics,
    log,
    chatMod,
    proposals,
    sortition,
  }

  // Update gauge metrics periodically
  setInterval(() => {
    void (async () => {
      const userCount = await db.getUserCount()
      const spaceCount = await db.getSpaceCount()
      metrics.activeUsers.set(userCount)
      metrics.activeSpaces.set(spaceCount)
    })()
  }, 60_000)

  setInterval(() => {
    void sortition.processScheduled()
  }, 30_000)

  const server = createServer(async (req, res) => {
    try {
      const matched = await routeRequest(req, res, ctx)
      if (!matched) writeJsonFallback(res)
    } catch (err: any) {
      log.error({ err, url: req.url }, 'HTTP handler error')
      if (!res.headersSent) {
        if (err instanceof HttpError) {
          writeJson(res, err.statusCode, { error: err.message })
        } else {
          writeJson(res, 500, { error: err.message })
        }
      }
    }
  })

  server.listen(config.port, () => {
    log.info({ port: config.port }, 'Bridge server listening')
  })

  // Start workers
  retryWorker.start()
  syncPoller.start()
  await firehose.start()

  // Proposal state machine — runs every 10 minutes to enforce constitution
  const proposalCron = setInterval(() => {
    proposals.processStateTransitions().catch((err: any) => {
      log.error({ err }, 'Proposal state transition error')
    })
  }, 600_000)

  // Badge recompute + expiry — runs every 5 minutes
  const badgeCron = setInterval(() => {
    void (async () => {
      try {
        await chatMod.runExpiry()
      } catch (err: any) {
        log.error({ err }, 'Badge expiry error')
      }
      const communityUris = await db.getActiveCommunityUris()
      for (const uri of communityUris) {
        await chatMod.recomputeCommunity(uri)
      }
    })()
  }, 300_000)

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log.info({ signal }, 'Shutting down...')
    retryWorker.stop()
    syncPoller.stop()
    await firehose.stop()
    clearInterval(proposalCron)
    clearInterval(badgeCron)
    server.close()
    await db.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
