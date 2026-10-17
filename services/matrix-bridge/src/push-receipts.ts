import type { Logger } from 'pino'
import type { IBridgeDatabase } from './db/interface.js'
import { readBoundedJson } from './http-response.js'
import type { BridgeMetrics } from './metrics.js'

/** A receipt confirms provider acceptance, never that a device displayed the notification. */
export class PushReceiptWorker {
  private timer?: NodeJS.Timeout
  private inFlight?: Promise<void>

  constructor(
    private db: IBridgeDatabase,
    private log: Logger,
    private metrics?: BridgeMetrics,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      void this.run().catch(() => {
        this.metrics?.pushReceiptResults.inc({ result: 'check_error' })
        this.log.warn('Push receipt check unavailable')
      })
    }, 60_000)
    void this.run().catch(() => {
      this.metrics?.pushReceiptResults.inc({ result: 'check_error' })
      this.log.warn('Push receipt check unavailable')
    })
  }

  async stop(): Promise<void> {
    clearInterval(this.timer)
    await this.inFlight?.catch(() => {})
  }

  run(now = Date.now()): Promise<void> {
    if (this.inFlight) return this.inFlight
    const work = this.check(now).finally(() => {
      if (this.inFlight === work) this.inFlight = undefined
    })
    this.inFlight = work
    return work
  }

  private async check(now: number): Promise<void> {
    await this.db.prunePushDeliveries(now - 7 * 24 * 3600_000)
    const pending = await this.db.getPendingPushReceipts(now)
    this.metrics?.pushReceiptBatch.set(pending.length)
    const expired = pending.filter(
      (row) => now - row.createdAt >= 24 * 3600_000 || !row.receiptId,
    )
    for (const row of expired) {
      await this.db.resolvePushReceipt(
        row.id,
        'failed',
        'ReceiptUnavailable',
        now,
      )
      this.metrics?.pushReceiptResults.inc({ result: 'failed' })
      this.log.warn('Push receipt expired without provider confirmation')
    }
    const ready = pending.filter((row) => !expired.includes(row))
    if (!ready.length) return
    const response = await fetch(
      'https://exp.host/--/api/v2/push/getReceipts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [...new Set(ready.map((row) => row.receiptId))],
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      },
    )
    if (!response.ok) throw new Error('Push receipts unavailable')
    const result = await readBoundedJson<{
      data?: Record<string, { status?: string; details?: { error?: string } }>
    }>(response, 1_048_576)
    if (
      !result.data ||
      typeof result.data !== 'object' ||
      Array.isArray(result.data)
    )
      throw new Error('Invalid push receipt response')
    for (const row of ready) {
      const receipt = result.data[row.receiptId!]
      if (!receipt) {
        await this.db.resolvePushReceipt(row.id, 'submitted', null, now)
        continue
      }
      if (receipt.status === 'ok') {
        await this.db.resolvePushReceipt(row.id, 'provider_accepted', null, now)
        this.metrics?.pushReceiptResults.inc({ result: 'provider_accepted' })
      } else if (receipt.status === 'error') {
        const code = receipt.details?.error
        const error =
          typeof code === 'string' && /^[A-Za-z]{1,64}$/.test(code)
            ? code
            : 'ProviderRejected'
        await this.db.resolvePushReceipt(
          row.id,
          error === 'DeviceNotRegistered' ? 'rejected' : 'failed',
          error,
          now,
        )
        this.metrics?.pushReceiptResults.inc({
          result: error === 'DeviceNotRegistered' ? 'rejected' : 'failed',
        })
        this.log.warn(
          { errorCode: error },
          'Push provider rejected notification',
        )
      } else throw new Error('Invalid push receipt status')
    }
  }
}
