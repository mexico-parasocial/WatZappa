import type { IncomingMessage, ServerResponse } from 'node:http'
import { authenticateM8 } from '../m8-auth.js'
import { audienceFilterFor } from '../events/bus.js'
import type { BridgeEvent } from '../db/records.js'
import type { RouteContext } from './context.js'
import { writeJson } from './http.js'

/**
 * GET /api/events — Server-Sent Events stream of bridge events for the
 * authenticated caller (M8 bearer).
 *
 * Protocol:
 *  - `retry: 5000` hint, then a `hello` event carrying the current max seq
 *  - replay: events with seq > Last-Event-ID (or ?lastSeq=) that the caller
 *    is entitled to *now* — permissions are re-evaluated during replay
 *  - live delivery with per-event `id: <seq>`; clients dedup on seq
 *    (delivery is at-least-once)
 *  - if the cursor predates the retention window, a `resync_required` event
 *    is sent instead of a silent gap
 *  - 25s heartbeat comment lines keep intermediaries from idling out
 *  - the stream closes when the bus is not healthy or the client vanishes;
 *    revoking M8 sessions takes effect on the next reconnect
 */
export async function apiEventsSseHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const did = auth.did

  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const headerLast = Number(req.headers['last-event-id'] ?? NaN)
  const queryLast = Number(url.searchParams.get('lastSeq') ?? NaN)
  const lastSeq = Number.isFinite(headerLast)
    ? headerLast
    : Number.isFinite(queryLast)
      ? queryLast
      : 0

  // The caller's current communities — drives both replay and live filters.
  const rooms = await ctx.db.getActiveCommunityRoomsForDid(did)
  const callerCommunities = new Set(rooms.map((r) => r.communityUri))
  const mayReceive = audienceFilterFor(did, callerCommunities)

  const bus = ctx.events
  if (!bus) {
    writeJson(res, 503, { error: 'Event bus unavailable' })
    return
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  const send = (event: string, data: unknown, id?: number) => {
    if (id !== undefined) res.write(`id: ${id}\n`)
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  res.write('retry: 5000\n\n')
  const maxSeq = await bus.maxSeq()
  send('hello', { maxSeq, communities: [...callerCommunities] })

  // Retention check: a cursor older than the oldest retained seq cannot be
  // replayed — tell the client to resync rather than skip silently.
  const oldest = await bus.oldestRetainedSeq()
  if (lastSeq > 0 && oldest !== null && lastSeq + 1 < oldest) {
    send('resync_required', { oldestRetainedSeq: oldest, maxSeq })
  } else {
    const { events } = await bus.replay(lastSeq, mayReceive)
    for (const event of events) {
      send(event.type, event.payload, event.seq)
    }
  }

  let closed = false
  const unsubscribe = bus.subscribe((event: BridgeEvent) => {
    if (closed) return
    if (!mayReceive(event)) return
    try {
      send(event.type, event.payload, event.seq)
    } catch {
      cleanup()
    }
  })

  const heartbeat = setInterval(() => {
    if (closed) return
    try {
      res.write(': heartbeat\n\n')
    } catch {
      cleanup()
    }
  }, 25_000)

  function cleanup() {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    unsubscribe()
    res.end()
  }

  req.on('close', cleanup)
}
