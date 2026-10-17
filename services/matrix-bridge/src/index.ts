import { createServer } from 'node:http'
import pino from 'pino'
import { ChallengeStore } from './challenge.js'
import { ChatModerationEngine } from './chat-moderation.js'
import { createAuthorityResolver } from './community-authority.js'
import { loadConfig } from './config.js'
import { createDatabase } from './db/index.js'
import { EventBus } from './events/bus.js'
import { FirehoseConsumer } from './firehose.js'
import { HttpError } from './m8-auth.js'
import { createMatrixProjection } from './matrix-projection.js'
import { MatrixSyncPoller } from './matrix-sync.js'
import { MatrixAdminClient } from './matrix.js'
import { sweepExpiredMembershipLeases } from './membership-lease.js'
import { BridgeMetrics } from './metrics.js'
import { ProposalEngine } from './proposals.js'
import { PushReceiptWorker } from './push-receipts.js'
import { RetryWorker } from './retry.js'
import type { RouteContext } from './routes/context.js'
import { writeJson } from './routes/http.js'
import { routeRequest, writeJsonFallback } from './routes/router.js'
import { createSanctionEnforcer } from './sanction-enforcement.js'
import { createSortitionEngine } from './sortition-runs.js'

async function main() {
  const config = loadConfig()
  const authority = createAuthorityResolver(config)

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
  const projection = createMatrixProjection(
    config,
    db,
    matrix,
    log,
    (community, did) => firehose.refreshMembership(community, did),
  )
  const challenges = new ChallengeStore()
  const chatMod = new ChatModerationEngine(db, log)
  const events = new EventBus(db, log)
  const proposals = new ProposalEngine(db, matrix, log, chatMod)
  const firehose = new FirehoseConsumer(
    config,
    db,
    projection,
    proposals,
    chatMod,
    metrics,
    log,
    authority,
  )
  firehose.setEventBus(events)
  proposals.setEventBus(events)
  const retryWorker = new RetryWorker(
    db,
    projection,
    metrics,
    log,
    (community, did, force) =>
      firehose.refreshMembership(community, did, force),
    (community, did) => firehose.retryCommunityProvision(community, did),
  )
  const syncPoller = new MatrixSyncPoller(config, db, matrix, chatMod, log)
  const pushReceipts = new PushReceiptWorker(db, log, metrics)

  chatMod.setEventBus(events)
  syncPoller.setEventBus(events)
  const sortition = createSortitionEngine(db, log, events)

  const ctx: RouteContext = {
    config,
    db,
    matrix,
    projection,
    challenges,
    firehose,
    metrics,
    log,
    chatMod,
    proposals,
    sortition,
    events,
  }

  // @NOTE sanitize/project persisted authority before accepting API traffic.
  await firehose.reconcileAuthorities(true)
  let authoritySweepRunning = false
  const authoritySweep = setInterval(async () => {
    if (authoritySweepRunning) return
    authoritySweepRunning = true
    try {
      await firehose.reconcileAuthorities()
    } catch (err) {
      log.error({ err }, 'Verified authority reconciliation failed')
    } finally {
      authoritySweepRunning = false
    }
  }, 60_000)

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
  pushReceipts.start()
  syncPoller.start()
  await firehose.start()

  // Proposal state machine — runs every 10 minutes to enforce constitution
  const proposalCron = setInterval(() => {
    proposals.processStateTransitions().catch((err: any) => {
      log.error({ err }, 'Proposal state transition error')
    })
  }, 600_000)

  // SSE event_log retention pruning — hourly
  const eventPruneCron = setInterval(() => {
    void events.prune()
  }, 3_600_000)

  // Membership-lease sweep (CD-M6) — hourly, plus once shortly after start.
  const leaseSweepCron = setInterval(() => {
    void (async () => {
      try {
        await sweepExpiredMembershipLeases(
          db,
          matrix,
          log,
          config.membershipLeaseTtlMs,
        )
      } catch (err: any) {
        log.error({ err }, 'Membership-lease sweep failed')
      }
    })()
  }, 3_600_000)
  setTimeout(() => {
    void sweepExpiredMembershipLeases(
      db,
      matrix,
      log,
      config.membershipLeaseTtlMs,
    ).catch((err: any) => log.error({ err }, 'Membership-lease sweep failed'))
  }, 60_000)

  // Time-limited mutes and bans: lift the ones that ran out, in Matrix as well
  // as in the badge. Without this an expired mute stays in force on the
  // homeserver forever while the app says it is over.
  const sanctionEnforcer = createSanctionEnforcer({
    db,
    matrix,
    projection,
    log,
  })
  const sanctionExpiryCron = setInterval(() => {
    void chatMod
      .liftExpiredSanctions(async (did, communityUri, kind) => {
        const outcome = await sanctionEnforcer.lift(did, communityUri, kind)
        return outcome.status !== 'failed' && outcome.status !== 'partial'
      })
      .catch((err: any) => log.error({ err }, 'Sanction expiry sweep failed'))
  }, 60_000)

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
    await pushReceipts.stop()
    await firehose.stop()
    clearInterval(authoritySweep)
    clearInterval(proposalCron)
    clearInterval(badgeCron)
    clearInterval(sanctionExpiryCron)
    clearInterval(eventPruneCron)
    clearInterval(leaseSweepCron)
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
