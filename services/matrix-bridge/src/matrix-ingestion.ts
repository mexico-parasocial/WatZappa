import type { IBridgeDatabase } from './db/index.js'
import type { BridgeEvent } from './db/records.js'
import type { EventBus } from './events/bus.js'

export interface MatrixEventMetadata {
  eventId: string
  roomId: string
  sender: string
  type: string
  originServerTs: number
}

/** Atomically persist metadata, participation and durable unread invalidations. */
export async function ingestMatrixEvents(
  db: IBridgeDatabase,
  events: MatrixEventMetadata[],
  bus?: EventBus,
  txnId?: string,
): Promise<void> {
  const notices = await db.transaction(async () => {
    if (txnId !== undefined && !(await db.recordAsTransaction(txnId))) return []
    const rooms = new Map<string, string>()
    for (const event of events) {
      const community = await db.getCommunityByRoomId(event.roomId)
      // @NOTE appservice namespaces can include DMs and untracked rooms.
      if (!community) continue
      if (!(await db.insertMatrixEvent({ ...event, content: '' }))) continue
      if (!['m.room.message', 'm.room.encrypted'].includes(event.type)) continue
      rooms.set(event.roomId, community.communityUri)
      const did = await db.getDidForMxid(event.sender)
      if (did) {
        await db.ensureParticipationStats(
          did,
          community.communityUri,
          event.roomId,
        )
        await db.incrementMessageCount(did, community.communityUri)
      }
    }
    const persisted: BridgeEvent[] = []
    for (const [roomId, communityUri] of rooms) {
      persisted.push(
        await db.appendEvent({
          type: 'chat.unread',
          communityUri,
          audienceDids: null,
          payload: { roomId, invalidated: true },
        }),
      )
    }
    return persisted
  })
  for (const notice of notices) bus?.notifyCommitted(notice)
}
