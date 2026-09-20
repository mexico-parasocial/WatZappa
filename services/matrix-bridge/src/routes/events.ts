import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BridgeEvent } from '../db/records.js'
import { REPLAY_BATCH } from '../events/bus.js'
import { HttpError, authenticateM8 } from '../m8-auth.js'
import type { RouteContext } from './context.js'
import { writeJson } from './http.js'

/** Re-evaluate the resource at delivery, including explicit audiences. */
export async function mayReceiveEvent(
  ctx: RouteContext,
  did: string,
  event: BridgeEvent,
): Promise<boolean> {
  if (event.audienceDids && !event.audienceDids.includes(did)) return false
  const payload = event.payload as { roomId?: unknown } | null
  if (
    event.type === 'chat.unread' ||
    (payload && typeof payload.roomId === 'string')
  ) {
    if (!payload || typeof payload.roomId !== 'string' || !event.communityUri)
      return false
    const rooms = await ctx.db.getActiveCommunityRoomsForDid(did)
    return rooms.some(
      (room) =>
        room.roomId === payload.roomId &&
        room.communityUri === event.communityUri,
    )
  }
  // @NOTE targeted lifecycle notices can explain a membership removal.
  if (event.audienceDids) return true
  if (!event.communityUri) return false
  const membership = await ctx.db.getCommunityMembership(
    did,
    event.communityUri,
  )
  return membership?.state === 'active'
}

/** Durable log is the source of truth; notifications only wake the drain. */
export async function apiEventsSseHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const bus = ctx.events
  if (!bus) {
    writeJson(res, 503, { error: 'Event bus unavailable' })
    return
  }
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const rawCursor =
    req.headers['last-event-id'] ?? url.searchParams.get('lastSeq') ?? '0'
  let cursor = Number(rawCursor)
  if (!Number.isSafeInteger(cursor) || cursor < 0)
    throw new HttpError(400, 'Invalid event cursor')
  let closed = false
  let draining = false
  let dirty = false
  let unsubscribe = () => {}
  let heartbeat: NodeJS.Timeout | undefined
  let authenticatedAt = Date.now()
  const cleanup = () => {
    if (closed) return
    closed = true
    if (heartbeat) clearInterval(heartbeat)
    unsubscribe()
    res.end()
  }
  const write = (text: string) => {
    if (closed) return
    if (!res.write(text)) cleanup()
  }
  const send = (type: string, payload: unknown, id?: number) => {
    write(
      `${id === undefined ? '' : `id: ${id}\n`}event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`,
    )
  }
  const drain = async () => {
    dirty = true
    if (draining || closed) return
    draining = true
    try {
      do {
        dirty = false
        if (Date.now() - authenticatedAt >= 60_000) {
          const current = await authenticateM8(req, ctx.config)
          if (current.did !== auth.did)
            throw new HttpError(401, 'Session identity changed')
          authenticatedAt = Date.now()
        }
        const maxSeq = await bus.maxSeq()
        const oldest = await bus.oldestRetainedSeq()
        if (
          cursor > maxSeq ||
          (cursor > 0 && oldest !== null && cursor + 1 < oldest)
        ) {
          cursor = maxSeq
          send('resync_required', { maxSeq, oldestRetainedSeq: oldest }, cursor)
        }
        while (!closed && cursor < maxSeq) {
          const batch = await ctx.db.listEventsAfter(cursor, REPLAY_BATCH)
          if (!batch.length) {
            cursor = maxSeq
            send('resync_required', { maxSeq }, cursor)
            break
          }
          for (const event of batch) {
            if (closed || event.seq > maxSeq) break
            if (await mayReceiveEvent(ctx, auth.did, event))
              send(event.type, event.payload, event.seq)
            cursor = event.seq
          }
          if (!closed) send('checkpoint', { seq: cursor }, cursor)
        }
      } while (dirty && !closed)
    } catch (err) {
      ctx.log.warn({ err }, 'SSE connection closed')
      cleanup()
    } finally {
      draining = false
    }
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.on('close', cleanup)
  res.on('error', cleanup)
  req.on('aborted', cleanup)
  unsubscribe = bus.subscribe(() => {
    void drain()
  })
  write('retry: 5000\n\n')
  send('hello', { maxSeq: await bus.maxSeq() })
  if (closed) {
    unsubscribe()
    return
  }
  heartbeat = setInterval(() => {
    write(': heartbeat\n\n')
    void drain()
  }, 25_000)
  heartbeat.unref()
  await drain()
}
