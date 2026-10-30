import { type Server, createServer } from 'node:http'
import type { Logger } from 'pino'
import { ChallengeStore } from './challenge.js'
import { ChatDisabledError, writeChatDisabled } from './chat-mode.js'
import { ChatModerationEngine } from './chat-moderation.js'
import { createAuthorityResolver } from './community-authority.js'
import type { Config } from './config.js'
import { ControlStore } from './control-store.js'
import { createDatabase } from './db/index.js'
import { EventBus } from './events/bus.js'
import { FirehoseConsumer } from './firehose.js'
import { HttpError } from './m8-auth.js'
import {
  type MatrixProjectionPort,
  createChatDisabledProjection,
  createMatrixProjection,
} from './matrix-projection.js'
import { MatrixSyncPoller } from './matrix-sync.js'
import { MatrixAdminClient } from './matrix.js'
import { sweepExpiredMembershipLeases } from './membership-lease.js'
import { BridgeMetrics } from './metrics.js'
import {
  createOpsServer,
  loadOpsConfig,
  syncLogProvisioningQueue,
} from './ops.js'
import { ProposalEngine } from './proposals.js'
import { PushReceiptWorker } from './push-receipts.js'
import { RetryWorker } from './retry.js'
import type { RouteContext } from './routes/context.js'
import { writeJson } from './routes/http.js'
import { routeRequest, writeJsonFallback } from './routes/router.js'
import { createSanctionEnforcer } from './sanction-enforcement.js'
import { createSortitionEngine } from './sortition-runs.js'

export interface Bridge {
  ctx: RouteContext
  server: Server
  /**
   * Schedule the periodic jobs, serve, and run the workers. Resolves only
   * when the firehose stops, so everything is scheduled before it starts.
   */
  start(): Promise<void>
  stop(): Promise<void>
}

/**
 * Wire every component from config. With chat off (`matrixChatEnabled`
 * false) nothing here talks to a homeserver: no admin client, a no-op
 * projection, and no sync poller, Matrix retry jobs or membership-lease
 * sweep.
 */
export async function createBridge(
  config: Config,
  log: Logger,
): Promise<Bridge> {
  const authority = createAuthorityResolver(config)
  const chatEnabled = config.matrixChatEnabled
  if (!chatEnabled) {
    log.warn('Matrix chat disabled: serving governance only')
  }

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

  const matrix = chatEnabled ? new MatrixAdminClient(config) : null
  const metrics = new BridgeMetrics()
  const projection: MatrixProjectionPort = matrix
    ? createMatrixProjection(
        config,
        db,
        matrix,
        log,
        (community, did): Promise<void> =>
          firehose.refreshMembership(community, did),
      )
    : createChatDisabledProjection()
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
    chatEnabled,
  )
  const syncPoller = matrix
    ? new MatrixSyncPoller(config, db, matrix, chatMod, log)
    : null
  const pushReceipts = new PushReceiptWorker(db, log, metrics)

  if (matrix && !matrix.canRevokeDevices) {
    log.warn(
      'MATRIX_MAS_* not configured: device revocation will fail until the MAS admin client is set',
    )
  }
  // Private chat operations listener: opt-in (CHAT_OPS_PORT), chat on only.
  if (!matrix && process.env.CHAT_OPS_PORT) {
    log.warn('CHAT_OPS_PORT ignored: chat is disabled')
  }
  const opsConfig = matrix ? loadOpsConfig() : undefined
  const controlStore = opsConfig ? new ControlStore(config) : undefined
  const opsServer =
    opsConfig && controlStore && matrix
      ? createOpsServer(
          opsConfig,
          { db, log, firehose, matrix },
          controlStore,
          syncLogProvisioningQueue(db, (community, did) =>
            firehose.retryCommunityProvision(community, did),
          ),
        )
      : undefined

  chatMod.setEventBus(events)
  syncPoller?.setEventBus(events)
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

  const server = createServer(async (req, res) => {
    try {
      const matched = await routeRequest(req, res, ctx)
      if (!matched) writeJsonFallback(res)
    } catch (err: any) {
      log.error({ err, url: req.url }, 'HTTP handler error')
      if (!res.headersSent) {
        if (err instanceof ChatDisabledError) {
          writeChatDisabled(res)
        } else if (err instanceof HttpError) {
          writeJson(res, err.statusCode, { error: err.message })
        } else {
          writeJson(res, 500, { error: err.message })
        }
      }
    }
  })

  const timers: NodeJS.Timeout[] = []

  const start = async (): Promise<void> => {
    // @NOTE sanitize/project persisted authority before accepting API traffic.
    await firehose.reconcileAuthorities(true)
    let authoritySweepRunning = false
    timers.push(
      setInterval(async () => {
        if (authoritySweepRunning) return
        authoritySweepRunning = true
        try {
          await firehose.reconcileAuthorities()
        } catch (err) {
          log.error({ err }, 'Verified authority reconciliation failed')
        } finally {
          authoritySweepRunning = false
        }
      }, 60_000),
    )

    // Update gauge metrics periodically
    timers.push(
      setInterval(() => {
        void (async () => {
          const userCount = await db.getUserCount()
          const spaceCount = await db.getSpaceCount()
          metrics.activeUsers.set(userCount)
          metrics.activeSpaces.set(spaceCount)
        })()
      }, 60_000),
    )

    timers.push(
      setInterval(() => {
        void sortition.processScheduled()
      }, 30_000),
    )

    // Proposal state machine — runs every 10 minutes to enforce constitution
    timers.push(
      setInterval(() => {
        proposals.processStateTransitions().catch((err: any) => {
          log.error({ err }, 'Proposal state transition error')
        })
      }, 600_000),
    )

    // SSE event_log retention pruning — hourly
    timers.push(
      setInterval(() => {
        void events.prune()
      }, 3_600_000),
    )

    // Membership-lease sweep (CD-M6) — hourly, plus once shortly after start.
    // Leases are on chat accounts, so there is nothing to sweep with chat off.
    if (matrix) {
      timers.push(
        setInterval(() => {
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
        }, 3_600_000),
      )
      timers.push(
        setTimeout(() => {
          void sweepExpiredMembershipLeases(
            db,
            matrix,
            log,
            config.membershipLeaseTtlMs,
          ).catch((err: any) =>
            log.error({ err }, 'Membership-lease sweep failed'),
          )
        }, 60_000),
      )
    }

    // Time-limited mutes and bans: lift the ones that ran out, in Matrix as well
    // as in the badge. Without this an expired mute stays in force on the
    // homeserver forever while the app says it is over.
    const sanctionEnforcer = createSanctionEnforcer({
      db,
      matrix,
      projection,
      log,
    })
    timers.push(
      setInterval(() => {
        void chatMod
          .liftExpiredSanctions(async (did, communityUri, kind) => {
            const outcome = await sanctionEnforcer.lift(did, communityUri, kind)
            return outcome.status !== 'failed' && outcome.status !== 'partial'
          })
          .catch((err: any) =>
            log.error({ err }, 'Sanction expiry sweep failed'),
          )
      }, 60_000),
    )

    // Badge recompute + expiry — runs every 5 minutes
    timers.push(
      setInterval(() => {
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
      }, 300_000),
    )
    server.listen(config.port, () => {
      log.info({ port: config.port }, 'Bridge server listening')
    })
    if (opsServer && opsConfig) {
      opsServer.listen(opsConfig.port, opsConfig.host, () =>
        log.info({ port: opsConfig.port }, 'Private chat operations listening'),
      )
    }

    // Start workers. The firehose goes last: its start() only returns once
    // the consumer is stopped, so nothing may be scheduled after it.
    retryWorker.start()
    pushReceipts.start()
    syncPoller?.start()
    await firehose.start()
  }

  const stop = async (): Promise<void> => {
    retryWorker.stop()
    syncPoller?.stop()
    await pushReceipts.stop()
    await firehose.stop()
    for (const timer of timers) clearTimeout(timer)
    server.close()
    opsServer?.close()
    await controlStore?.close()
    await db.close()
  }

  return { ctx, server, start, stop }
}
