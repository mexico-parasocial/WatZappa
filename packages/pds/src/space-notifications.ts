import { randomUUID } from 'node:crypto'
import { DAY, HOUR, MINUTE, SECOND, TID } from '@atproto/common'
import type {
  AccountDb,
  SpaceNotificationRetry,
} from './account-manager/db/index.js'
import { spaceLogger } from './logger.js'

export type SpaceNotification = Pick<
  SpaceNotificationRetry,
  'repo' | 'space' | 'repoRev' | 'hash'
>

/** Durable, coalescing delivery for space writer updates. No transport is selected here. */
export class SpaceNotifications implements AsyncDisposable {
  private readonly owner = randomUUID()
  private readonly abort = new AbortController()
  private timer?: NodeJS.Timeout
  private running?: Promise<void>

  constructor(
    private readonly db: AccountDb,
    private readonly deliver: (
      body: SpaceNotification,
      signal: AbortSignal,
    ) => Promise<void>,
    private readonly shouldRetry: (error: unknown) => boolean,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    if (this.timer || this.abort.signal.aborted) return
    this.timer = setInterval(
      () =>
        void this.retryPending().catch((err) =>
          spaceLogger.warn({ err }, 'space notification retries failed'),
        ),
      10 * SECOND,
    )
    this.timer.unref()
    void this.retryPending().catch((err) =>
      spaceLogger.warn({ err }, 'space notification retries failed'),
    )
  }

  async notify(body: SpaceNotification): Promise<void> {
    TID.fromStr(body.repoRev)
    try {
      await this.deliver(body, this.abort.signal)
      await this.clearDelivered(body)
    } catch (error) {
      if (!this.shouldRetry(error)) {
        await this.clearDelivered(body)
        return
      }
      const now = this.now()
      const schedule = {
        attempts: 1,
        retryAt: now + retryDelay(1),
        expiresAt: now + DAY,
      }
      await this.db.db
        .insertInto('space_notification_retry')
        .values({ ...body, ...schedule })
        .onConflict((oc) =>
          oc
            .columns(['repo', 'space'])
            .doUpdateSet({
              repoRev: body.repoRev,
              hash: body.hash,
              ...schedule,
            })
            .where('space_notification_retry.repoRev', '<', body.repoRev),
        )
        .execute()
    }
  }

  retryPending(): Promise<void> {
    if (this.abort.signal.aborted) return Promise.resolve()
    return (this.running ??= this.retry().finally(() => {
      this.running = undefined
    }))
  }

  private async retry(): Promise<void> {
    while (!this.abort.signal.aborted) {
      const now = this.now()
      const leaseUntil = now + MINUTE
      const lease = await this.db.db
        .updateTable('space_notification_lease')
        .set({ owner: this.owner, expiresAt: leaseUntil })
        .where('id', '=', 1)
        .where((eb) =>
          eb.or([eb('owner', '=', this.owner), eb('expiresAt', '<=', now)]),
        )
        .executeTakeFirst()
      if (lease.numUpdatedRows === 0n) return

      const due = await this.db.db
        .selectFrom('space_notification_retry')
        .selectAll()
        .where('retryAt', '<=', now)
        .orderBy('retryAt')
        .limit(5)
        .execute()
      if (!due.length || this.abort.signal.aborted || this.now() >= leaseUntil)
        return
      for (const retry of due) {
        if (this.abort.signal.aborted || this.now() >= leaseUntil) return
        if (retry.expiresAt <= this.now()) {
          await this.db.db
            .deleteFrom('space_notification_retry')
            .where('repo', '=', retry.repo)
            .where('space', '=', retry.space)
            .where('repoRev', '=', retry.repoRev)
            .where('expiresAt', '<=', this.now())
            .execute()
          continue
        }
        try {
          await this.deliver(retry, this.abort.signal)
          await this.clearDelivered(retry)
        } catch (error) {
          if (!this.shouldRetry(error)) {
            await this.clearDelivered(retry)
            continue
          }
          const attempts = retry.attempts + 1
          await this.db.db
            .updateTable('space_notification_retry')
            .set({
              attempts,
              retryAt: Math.min(
                this.now() + retryDelay(attempts),
                retry.expiresAt,
              ),
            })
            .where('repo', '=', retry.repo)
            .where('space', '=', retry.space)
            .where('repoRev', '=', retry.repoRev)
            .where('attempts', '=', retry.attempts)
            .execute()
        }
      }
    }
  }

  private async clearDelivered(body: SpaceNotification): Promise<void> {
    await this.db.db
      .deleteFrom('space_notification_retry')
      .where('repo', '=', body.repo)
      .where('space', '=', body.space)
      .where('repoRev', '<=', body.repoRev)
      .execute()
  }

  async destroy(): Promise<void> {
    if (this.abort.signal.aborted) return
    clearInterval(this.timer)
    this.abort.abort()
    await this.running
    await this.db.db
      .updateTable('space_notification_lease')
      .set({ expiresAt: 0 })
      .where('id', '=', 1)
      .where('owner', '=', this.owner)
      .execute()
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy()
  }
}

function retryDelay(attempts: number): number {
  const maximum = Math.min(MINUTE * 2 ** Math.min(attempts - 1, 6), HOUR)
  return Math.floor(maximum * (0.5 + Math.random() / 2))
}
