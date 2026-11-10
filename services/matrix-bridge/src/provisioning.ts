import type { Logger } from 'pino'
import type { ControlStore, ProvisionInput } from './control-store.js'
import type { IBridgeDatabase } from './db/index.js'
import type { MatrixProjectionPort } from './matrix-projection.js'
import type { BridgeMetrics } from './metrics.js'

export class CommunityProvisioner {
  private timer?: NodeJS.Timeout
  private running = false
  constructor(
    private store: ControlStore,
    private db: IBridgeDatabase,
    private projection: Pick<MatrixProjectionPort, 'createCommunitySpace'>,
    private log: Logger,
    private metrics?: BridgeMetrics,
  ) {}

  async enqueue(input: ProvisionInput): Promise<void> {
    const id = await this.store.enqueue(input)
    await this.retry(id).catch(() => {})
  }
  async retry(id: string, manual = false): Promise<boolean> {
    const job = await this.store.claim(id, manual)
    if (!job) return false
    try {
      const input = JSON.parse(job.input) as ProvisionInput
      // This job only provisions infrastructure; it never re-grants membership.
      // Room provenance/encryption checks make partial creation safe to replay.
      const result = await this.projection.createCommunitySpace(input)
      await this.db.transaction(async () => {
        await this.db.setSpaceForCommunity(
          input.communityUri,
          result.spaceId,
          input.slug,
          input.chamberMode,
        )
        await this.db.setChamberRooms(
          input.communityUri,
          result.chamberA_RoomId,
          result.chamberB_RoomId,
          result.observerRoomId,
        )
      })
      await this.store.finish(id, 'done', job.attempts)
      this.metrics?.spacesCreatedTotal.inc({ status: 'success' })
      return true
    } catch (error) {
      await this.store.finish(id, 'failed', job.attempts)
      this.metrics?.spacesCreatedTotal.inc({ status: 'failure' })
      this.log.warn(
        { err: error, jobId: id },
        'Community provisioning failed; durable retry retained',
      )
      throw error
    }
  }
  start(): void {
    const tick = async () => {
      if (this.running) return
      this.running = true
      try {
        for (const job of await this.store.pending())
          await this.retry(job.id).catch(() => {})
      } catch (error) {
        this.log.error({ err: error }, 'Provisioning retry scan failed')
      } finally {
        this.running = false
      }
    }
    this.timer = setInterval(() => void tick(), 60000)
    void tick()
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }
}
