import type { Logger } from 'pino'
import type { ChatModerationEngine } from './chat-moderation.js'
import type { Config } from './config.js'
import type { BridgeDatabase } from './db.js'
import type { MatrixAdminClient } from './matrix.js'

const DEFAULT_POLL_INTERVAL_MS = 30_000
const MAX_EVENTS_PER_POLL = 200

interface RoomPollState {
  roomId: string
  nextBatch?: string
  lastPollAt: number
}

export class MatrixSyncPoller {
  private db: BridgeDatabase
  private matrix: MatrixAdminClient
  private chatMod: ChatModerationEngine
  private log: Logger
  private pollIntervalMs: number
  private timer: NodeJS.Timeout | null = null
  private roomStates: Map<string, RoomPollState> = new Map()
  private isRunning = false

  constructor(
    config: Config,
    db: BridgeDatabase,
    matrix: MatrixAdminClient,
    chatMod: ChatModerationEngine,
    log: Logger,
  ) {
    this.db = db
    this.matrix = matrix
    this.chatMod = chatMod
    this.log = log
    this.pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
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

  private async pollAllRooms(): Promise<void> {
    const roomIds = this.db.getAllRoomIds()
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
  }

  private async pollRoom(roomId: string): Promise<void> {
    const state = this.roomStates.get(roomId) ?? { roomId, lastPollAt: 0 }
    const now = Date.now()

    // On first poll, only fetch last 24h to avoid backfilling too much
    const from = state.nextBatch
    const to = from ? undefined : String(now)

    const result = await this.matrix.getRoomMessages(roomId, {
      from,
      to,
      limit: MAX_EVENTS_PER_POLL,
      dir: 'b',
    })

    let newEvents = 0
    for (const event of result.chunk) {
      if (!event.event_id) continue

      // Skip if already processed
      if (this.db.eventExists(event.event_id)) {
        continue
      }

      const inserted = this.db.insertMatrixEvent({
        roomId,
        eventId: event.event_id,
        sender: event.sender,
        type: event.type,
        content: null,
        originServerTs: event.origin_server_ts,
      })

      if (inserted) {
        newEvents++

        // Record participation metadata only. Content stays in Matrix/Synapse.
        if (event.type === 'm.room.message' || event.type === 'm.room.encrypted') {
          const did = this.db.getDidForMxid(event.sender)
          const community = this.db.getCommunityByRoomId(roomId)
          if (did && community) {
            this.chatMod.recordMessage(did, community.communityUri, roomId)
            this.log.debug(
              { did, roomId, eventId: event.event_id },
              'Recorded message',
            )
          }
        }
      }
    }

    if (newEvents > 0) {
      this.log.info(
        { roomId, newEvents, totalChunk: result.chunk.length },
        'Ingested Matrix events',
      )
    }

    // Update state
    state.nextBatch = result.end
    state.lastPollAt = now
    this.roomStates.set(roomId, state)
  }
}
