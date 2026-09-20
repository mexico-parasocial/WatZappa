import type { Logger } from 'pino'
import type { ChatModerationEngine } from './chat-moderation.js'
import type { Config } from './config.js'
import type { IBridgeDatabase } from './db/index.js'
import type { EventBus } from './events/bus.js'
import { ingestMatrixEvents } from './matrix-ingestion.js'
import type { MatrixAdminClient } from './matrix.js'

const DEFAULT_POLL_INTERVAL_MS = 300_000
const MAX_EVENTS_PER_POLL = 200

export class MatrixSyncPoller {
  private events?: EventBus
  private db: IBridgeDatabase
  private matrix: MatrixAdminClient
  private chatMod: ChatModerationEngine
  private log: Logger
  private pollIntervalMs: number
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private isRunning = false

  constructor(
    config: Config,
    db: IBridgeDatabase,
    matrix: MatrixAdminClient,
    chatMod: ChatModerationEngine,
    log: Logger,
  ) {
    this.db = db
    this.matrix = matrix
    this.chatMod = chatMod
    this.log = log
    // Reconciliation fallback only: primary ingestion is appservice
    // transaction push (routes/appservice-txn.ts).
    this.pollIntervalMs = config.syncFallbackMs || DEFAULT_POLL_INTERVAL_MS
  }

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.log.info(
      { intervalMs: this.pollIntervalMs },
      'Matrix sync poller starting',
    )
    this.pollAllRooms().catch((err) => {
      this.log.error({ err }, 'Initial poll failed')
    })
    this.timer = setInterval(() => {
      this.pollAllRooms().catch((err) => {
        this.log.error({ err }, 'Periodic poll failed')
      })
    }, this.pollIntervalMs)
  }

  stop(): void {
    this.isRunning = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.log.info('Matrix sync poller stopped')
  }

  /** Late-injected SSE bus (main wires it after construction). */
  setEventBus(events: EventBus): void {
    this.events = events
  }

  private async pollAllRooms(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const roomIds = await this.db.getAllRoomIds()
      if (roomIds.length === 0) {
        this.log.debug('No rooms to poll')
        return
      }

      this.log.debug({ roomCount: roomIds.length }, 'Polling rooms')

      for (const roomId of roomIds) {
        try {
          await this.pollRoom(roomId)
        } catch (err: any) {
          this.log.error({ err, roomId }, 'Failed to poll room')
        }
      }
    } finally {
      this.polling = false
    }
  }

  private async pollRoom(roomId: string): Promise<void> {
    let cursor = await this.db.getMatrixPollCursor(roomId)
    for (let page = 0; page < 10; page++) {
      const result = await this.matrix.getRoomMessages(roomId, {
        from: cursor,
        limit: MAX_EVENTS_PER_POLL,
        dir: cursor ? 'f' : 'b',
      })
      await ingestMatrixEvents(
        this.db,
        result.chunk.map((event) => ({
          roomId,
          eventId: event.event_id,
          sender: event.sender,
          type: event.type,
          originServerTs: event.origin_server_ts,
        })),
        this.events,
      )
      // @NOTE first poll bootstraps the latest page; subsequent polls move forward.
      const next = cursor ? result.end : result.start
      if (next) await this.db.setMatrixPollCursor(roomId, next)
      if (
        !next ||
        next === cursor ||
        !cursor ||
        result.chunk.length < MAX_EVENTS_PER_POLL
      )
        return
      cursor = next
    }
  }
}
