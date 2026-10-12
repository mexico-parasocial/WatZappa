import type { Logger } from 'pino'
import type { IBridgeDatabase } from './db/index.js'
import type { MatrixProjectionPort } from './matrix-projection.js'
import type { BridgeMetrics } from './metrics.js'

const RETRY_INTERVAL_MS = 60_000
const MAX_RETRIES = 5

export class RetryWorker {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private db: IBridgeDatabase,
    private projection: MatrixProjectionPort,
    private metrics: BridgeMetrics,
    private log: Logger,
    private refreshAuthority: (
      community: string,
      did: string,
      force?: boolean,
    ) => Promise<void>,
    private provisionCommunity?: (
      community: string,
      did: string,
    ) => Promise<void>,
  ) {}

  start(): void {
    this.log.info({ intervalMs: RETRY_INTERVAL_MS }, 'Starting retry worker')
    this.timer = setInterval(() => {
      void this.run().catch((err) =>
        this.log.error({ err }, 'Retry run failed'),
      )
    }, RETRY_INTERVAL_MS)
    // Run immediately on start
    this.run().catch((err) =>
      this.log.error({ err }, 'Initial retry run failed'),
    )
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.running = false
  }

  private async run(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      const provisioning = await this.db.getProvisioningRetryJobs(50)
      this.metrics.provisioningRetryBlocked.set(
        provisioning.filter((job) => job.retryCount >= MAX_RETRIES).length,
      )
      const failed = [
        ...new Map(
          [...(await this.db.getFailedSyncs(50)), ...provisioning].map(
            (job) => [job.id, job],
          ),
        ).values(),
      ]
      if (failed.length === 0) return

      this.log.info({ count: failed.length }, 'Retrying failed syncs')

      for (const entry of failed) {
        // Skip entries that have been retried too many times
        const retryCount = await this.db.getRetryCount(entry.id)
        if (retryCount >= MAX_RETRIES && entry.eventType !== 'create_space') {
          this.log.warn(
            { entryId: entry.id, retries: retryCount },
            'Max retries exceeded, giving up',
          )
          continue
        }

        const end = this.metrics.syncLatency.startTimer({
          event_type: `retry_${entry.eventType}`,
        })
        try {
          if (
            entry.eventType === 'create_space' &&
            entry.communityUri &&
            entry.did
          ) {
            if (!this.provisionCommunity)
              throw new Error('Provisioning retry handler missing')
            await this.provisionCommunity(entry.communityUri, entry.did)
            await this.db.markSyncSuccess(entry.id)
            this.metrics.retryAttemptsTotal.inc({
              event_type: entry.eventType,
              status: 'success',
            })
          } else if (
            entry.eventType === 'apply_roles' &&
            entry.communityUri &&
            entry.did
          ) {
            // @NOTE resolve authority again; cached roles may have been revoked.
            await this.refreshAuthority(entry.communityUri, entry.did, true)
            await this.db.markSyncSuccess(entry.id)
            this.metrics.retryAttemptsTotal.inc({
              event_type: entry.eventType,
              status: 'success',
            })
            this.log.info({ entryId: entry.id }, 'Retry succeeded')
          } else if (
            entry.eventType === 'revoke' &&
            entry.communityUri &&
            entry.did
          ) {
            const space = await this.db.getSpaceForCommunity(entry.communityUri)
            await this.projection.revokeMemberAccess(
              space ?? null,
              entry.did,
              'retry',
            )
            await this.db.markSyncSuccess(entry.id)
            this.metrics.retryAttemptsTotal.inc({
              event_type: entry.eventType,
              status: 'success',
            })
            this.log.info({ entryId: entry.id }, 'Retry succeeded')
          }
        } catch (err: any) {
          await this.db.incrementRetryCount(entry.id)
          this.metrics.retryAttemptsTotal.inc({
            event_type: entry.eventType,
            status: 'failure',
          })
          this.log.error({ err, entryId: entry.id }, 'Retry failed')
        } finally {
          end()
        }
      }
    } finally {
      this.running = false
    }
  }
}
