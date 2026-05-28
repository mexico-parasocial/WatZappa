import type { Logger } from 'pino'
import type { BridgeDatabase } from './db.js'
import type { MatrixAdminClient } from './matrix.js'
import type { BridgeMetrics } from './metrics.js'

const RETRY_INTERVAL_MS = 60_000
const MAX_RETRIES = 5

export class RetryWorker {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(
    private db: BridgeDatabase,
    private matrix: MatrixAdminClient,
    private metrics: BridgeMetrics,
    private log: Logger,
  ) {}

  start(): void {
    this.log.info({ intervalMs: RETRY_INTERVAL_MS }, 'Starting retry worker')
    this.timer = setInterval(() => this.run(), RETRY_INTERVAL_MS)
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
      const failed = this.db.getFailedSyncs(50)
      if (failed.length === 0) return

      this.log.info({ count: failed.length }, 'Retrying failed syncs')

      for (const entry of failed) {
        // Skip entries that have been retried too many times
        const retryCount = this.db.getRetryCount(entry.id)
        if (retryCount >= MAX_RETRIES) {
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
          if (entry.eventType === 'create_space' && entry.spaceId) {
            // Space already exists or failed to create — nothing to retry
            this.log.debug({ entryId: entry.id }, 'Skipping create_space retry')
          } else if (
            entry.eventType === 'invite' &&
            entry.spaceId &&
            entry.did
          ) {
            await this.matrix.inviteUser(
              entry.spaceId,
              this.db.getMxidForDid(entry.did)!,
            )
            this.db.markSyncSuccess(entry.id)
            this.metrics.retryAttemptsTotal.inc({
              event_type: entry.eventType,
              status: 'success',
            })
            this.log.info({ entryId: entry.id }, 'Retry succeeded')
          } else if (entry.eventType === 'kick' && entry.spaceId && entry.did) {
            await this.matrix.kickUser(
              entry.spaceId,
              this.db.getMxidForDid(entry.did)!,
            )
            this.db.markSyncSuccess(entry.id)
            this.metrics.retryAttemptsTotal.inc({
              event_type: entry.eventType,
              status: 'success',
            })
            this.log.info({ entryId: entry.id }, 'Retry succeeded')
          }
        } catch (err: any) {
          this.db.incrementRetryCount(entry.id)
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
