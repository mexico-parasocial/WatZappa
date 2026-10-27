import { randomUUID } from 'node:crypto'
import {
  HOUR,
  MINUTE,
  SECOND,
  getPdsEndpoint,
  getServiceEndpoint,
} from '@atproto/common'
import { XrpcError } from '@atproto/lex'
import { SpaceRef, type SpaceRefString, isValidDid } from '@atproto/syntax'
import type {
  AccountDb,
  SpaceDeletedNotificationRetry,
} from './account-manager/db/index.js'
import type { AppContext } from './context.js'
import { com } from './lexicons/index.js'
import { spaceLogger } from './logger.js'

export type SpaceDeletionState = 'deleted' | 'active' | 'missing' | 'paused'
export type SpaceDeletionRecipient = { serviceDid: string; expiresAt: string }

/** Durable delivery of deletion notices; retries end with the registration. */
export class SpaceDeletionNotifications implements AsyncDisposable {
  private readonly owner = randomUUID()
  private readonly abort = new AbortController()
  private timer?: NodeJS.Timeout
  private running?: Promise<void>

  constructor(
    private readonly db: AccountDb,
    private readonly deps: {
      state: (space: SpaceRefString) => Promise<SpaceDeletionState>
      deliver: (
        space: SpaceRefString,
        service: string,
        signal: AbortSignal,
      ) => Promise<void>
    },
    private readonly now: () => number = Date.now,
  ) {}

  /** Persist before attempting any network delivery. */
  async enqueue(
    space: SpaceRefString,
    recipients: SpaceDeletionRecipient[],
  ): Promise<void> {
    const now = this.now()
    const rows = recipients
      .map(({ serviceDid: service, expiresAt }) => {
        const deadline = Date.parse(expiresAt)
        if (!Number.isFinite(deadline))
          throw new Error('Invalid syncer registration expiry')
        return {
          space,
          service,
          generation: randomUUID(),
          attempts: 0,
          retryAt: now,
          expiresAt: deadline,
        }
      })
      .filter((row) => row.expiresAt > now)
    if (!rows.length) return
    await this.db.transaction(async (tx) => {
      for (const row of rows) {
        await tx.db
          .insertInto('space_deleted_notification_retry')
          .values(row)
          .onConflict((oc) => oc.columns(['space', 'service']).doUpdateSet(row))
          .execute()
      }
    })
  }

  start(): void {
    if (this.timer || this.abort.signal.aborted) return
    const run = () =>
      void this.retryPending().catch((err) =>
        spaceLogger.warn({ err }, 'space deletion retries failed'),
      )
    this.timer = setInterval(run, 10 * SECOND)
    this.timer.unref()
    run()
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
      const [lease] = await this.db.executeWithRetry(
        this.db.db
          .updateTable('space_deleted_notification_lease')
          .set({ owner: this.owner, expiresAt: leaseUntil })
          .where('id', '=', 1)
          .where((eb) =>
            eb.or([eb('owner', '=', this.owner), eb('expiresAt', '<=', now)]),
          ),
      )
      if (lease.numUpdatedRows === 0n) return
      const rows = await this.db.db
        .selectFrom('space_deleted_notification_retry')
        .selectAll()
        .where('retryAt', '<=', now)
        .orderBy('retryAt')
        .limit(5)
        .execute()
      if (!rows.length) return
      for (const row of rows) {
        if (this.abort.signal.aborted || this.now() >= leaseUntil) return
        await this.retryOne(row)
      }
    }
  }

  private async retryOne(row: SpaceDeletedNotificationRetry): Promise<void> {
    if (row.expiresAt <= this.now()) return this.clear(row)
    const state = await this.deps.state(row.space)
    if (state === 'active' || state === 'missing') return this.clear(row)
    if (state === 'paused') return this.reschedule(row)
    try {
      await this.deps.deliver(
        row.space,
        row.service,
        AbortSignal.any([this.abort.signal, AbortSignal.timeout(10 * SECOND)]),
      )
      await this.clear(row)
    } catch (err) {
      if (this.abort.signal.aborted) return
      if (err instanceof XrpcError && !err.shouldRetry()) {
        await this.clear(row)
        spaceLogger.warn(
          { err, space: row.space, service: row.service },
          'space deletion permanently refused',
        )
      } else {
        await this.reschedule(row)
      }
    }
  }

  private async clear(row: SpaceDeletedNotificationRetry): Promise<void> {
    await this.db.executeWithRetry(
      this.db.db
        .deleteFrom('space_deleted_notification_retry')
        .where('space', '=', row.space)
        .where('service', '=', row.service)
        .where('generation', '=', row.generation),
    )
  }

  private async reschedule(row: SpaceDeletedNotificationRetry): Promise<void> {
    const attempts = row.attempts + 1
    const delay = Math.min(HOUR, MINUTE * 2 ** Math.min(attempts - 1, 6))
    await this.db.executeWithRetry(
      this.db.db
        .updateTable('space_deleted_notification_retry')
        .set({
          attempts,
          retryAt: Math.min(
            row.expiresAt,
            this.now() + Math.floor(delay * (0.5 + Math.random() / 2)),
          ),
        })
        .where('space', '=', row.space)
        .where('service', '=', row.service)
        .where('generation', '=', row.generation),
    )
  }

  async destroy(): Promise<void> {
    if (this.abort.signal.aborted) return
    clearInterval(this.timer)
    this.abort.abort()
    await this.running
    await this.db.executeWithRetry(
      this.db.db
        .updateTable('space_deleted_notification_lease')
        .set({ expiresAt: 0 })
        .where('id', '=', 1)
        .where('owner', '=', this.owner),
    )
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy()
  }
}

/** Use existing account identities and SSRF-filtered clients for notification delivery. */
export function createSpaceDeletionNotifications(
  ctx: AppContext,
): SpaceDeletionNotifications {
  return new SpaceDeletionNotifications(ctx.accountManager.db, {
    state: async (space) => {
      const { spaceDid } = SpaceRef.parse(space)
      const account = await ctx.accountManager.getAccount(spaceDid, {
        includeDeactivated: true,
        includeTakenDown: true,
      })
      if (!account) return 'missing'
      if (account.deactivatedAt || account.takedownRef) return 'paused'
      await ctx.actorStore.ensureLatestSchema(spaceDid)
      const row = await ctx.actorStore.read(spaceDid, (store) =>
        store.space.getSpace(space),
      )
      return row?.deletedAt ? 'deleted' : 'active'
    },
    deliver: async (space, service, signal) => {
      const [did, fragment] = service.split('#')
      if (!isValidDid(did)) throw new Error('Invalid registered syncer DID')
      const doc = await ctx.idResolver.did.resolve(did)
      const endpoint =
        doc &&
        (fragment
          ? getServiceEndpoint(doc, { id: `#${fragment}` })
          : getPdsEndpoint(doc))
      if (!endpoint) throw new Error('Cannot resolve registered syncer')
      const { spaceDid } = SpaceRef.parse(space)
      const method = com.atproto.space.notifySpaceDeleted
      const headers = await ctx.serviceAuthHeaders(
        spaceDid,
        service,
        method.$lxm,
      )
      await ctx
        .safeClient(endpoint)
        .call(method, { space }, { headers, signal })
    },
  })
}
