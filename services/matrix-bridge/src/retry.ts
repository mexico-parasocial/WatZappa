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
      const failed = await this.db.getFailedSyncs(50)
      if (failed.length === 0) return

      this.log.info({ count: failed.length }, 'Retrying failed syncs')

      for (const entry of failed) {
        // Skip entries that have been retried too many times
        const retryCount = await this.db.getRetryCount(entry.id)
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
            entry.eventType === 'apply_roles' &&
            entry.communityUri &&
            entry.did
          ) {
            // Handover projection: re-apply the member's current governance
            // roles as room power levels. Reading the current state (not the
            // state at failure time) is what makes the retry safe.
            const space = await this.db.getSpaceForCommunity(entry.communityUri)
            const membership = await this.db.getCommunityMembership(
              entry.did,
              entry.communityUri,
            )
            if (!space || !membership || membership.state !== 'active') {
              await this.db.markSyncSuccess(entry.id)
              continue
            }
            const roles = membership.roles ?? []
            const isObserver = roles.includes('observer')
            const assigned = await this.db.getChamberAssignment(
              entry.communityUri,
              entry.did,
            )
            const chamber =
              assigned === 'A' || assigned === 'B' ? assigned : null
            await this.projection.applyMemberRoles(space, entry.did, {
              roles,
              chamber,
              isObserver,
            })
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
