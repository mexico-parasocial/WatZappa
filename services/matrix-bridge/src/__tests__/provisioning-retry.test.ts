import pino from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../config.js'
import { SqliteBridgeDatabase } from '../db/index.js'
import { BridgeMetrics } from '../metrics.js'
import { RetryWorker } from '../retry.js'

const community = 'at://did:plc:owner/com.para.community.board/one'
const log = pino({ level: 'silent' })
afterEach(() => {
  vi.useRealTimers()
})
describe('durable provisioning retries', () => {
  it('keeps a failed job and completes it on a later worker run', async () => {
    vi.useFakeTimers()
    const db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as Config)
    await db.logSync(
      'create_space',
      community,
      'did:plc:owner',
      null,
      false,
      'outage',
    )
    const provision = vi
      .fn()
      .mockRejectedValueOnce(new Error('still down'))
      .mockResolvedValue(undefined)
    const worker = new RetryWorker(
      db,
      new BridgeMetrics(),
      log,
      async () => {},
      provision,
    )
    try {
      worker.start()
      await vi.advanceTimersByTimeAsync(1)
      const [job] = await db.getFailedSyncs(50)
      expect(job.communityUri).toBe(community)
      expect(await db.getRetryCount(job.id)).toBe(1)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(provision).toHaveBeenCalledTimes(2)
      expect(provision).toHaveBeenLastCalledWith(community, 'did:plc:owner')
      expect(await db.getFailedSyncs(50)).toEqual([])
    } finally {
      worker.stop()
      await db.close()
    }
  })
  it('recovers provisioning after an outage lasting beyond five failures', async () => {
    vi.useFakeTimers()
    const db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as Config)
    await db.logSync(
      'create_space',
      community,
      'did:plc:owner',
      null,
      false,
      'outage',
    )
    const [job] = await db.getFailedSyncs()
    for (let i = 0; i < 5; i++) await db.incrementRetryCount(job.id)
    const provision = vi.fn().mockResolvedValue(undefined)
    const worker = new RetryWorker(
      db,
      new BridgeMetrics(),
      log,
      async () => {},
      provision,
    )
    try {
      worker.start()
      await vi.advanceTimersByTimeAsync(1)
      expect(provision).toHaveBeenCalledOnce()
      expect(await db.getFailedSyncs()).toEqual([])
    } finally {
      worker.stop()
      await db.close()
    }
  })

  it('requires a provisioning handler instead of silently skipping the job', async () => {
    vi.useFakeTimers()
    const db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as Config)
    await db.logSync(
      'create_space',
      community,
      'did:plc:owner',
      null,
      false,
      'outage',
    )
    const worker = new RetryWorker(db, new BridgeMetrics(), log, async () => {})
    try {
      worker.start()
      await vi.advanceTimersByTimeAsync(1)
      const [job] = await db.getFailedSyncs(50)
      expect(await db.getRetryCount(job.id)).toBe(1)
    } finally {
      worker.stop()
      await db.close()
    }
  })
  it('revalidates access after more than five failures and keeps failed removal queued', async () => {
    vi.useFakeTimers()
    const db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as Config)
    await db.logSync(
      'revoke',
      community,
      'did:plc:member',
      '!main:para',
      false,
      'offline',
    )
    const [job] = await db.getAccessRetryJobs()
    for (let attempt = 0; attempt < 6; attempt++)
      await db.incrementRetryCount(job.id)
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error('still offline'))
      .mockResolvedValue(undefined)
    const worker = new RetryWorker(db, new BridgeMetrics(), log, refresh)
    try {
      worker.start()
      await vi.advanceTimersByTimeAsync(1)
      expect(refresh).toHaveBeenCalledWith(community, 'did:plc:member', true)
      expect((await db.getAccessRetryJobs())[0].retryCount).toBe(7)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(refresh).toHaveBeenCalledTimes(2)
      expect(await db.getAccessRetryJobs()).toEqual([])
    } finally {
      worker.stop()
      await db.close()
    }
  })
})
