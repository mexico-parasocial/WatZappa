import type { IncomingMessage, ServerResponse } from 'node:http'
import { HttpError } from '../m8-auth.js'
import { writeJson } from './http.js'
import type { RouteContext } from './context.js'

/**
 * Appservice transaction push: Synapse POSTs (or PUTs) every event in rooms
 * our namespace users occupy to `/_matrix/app/unstable/transactions/{txnId}`.
 * This replaces per-room admin polling as the primary ingestion path — the
 * MatrixSyncPoller remains only as a slow reconciliation fallback.
 *
 * Auth is the homeserver token (`hs_token` from the appservice registration,
 * env MATRIX_HS_TOKEN): Synapse sends it as the access_token query param or
 * Authorization header. Transactions are deduped by id in the DB; a repeated
 * txnId is acked 200 without reprocessing (Synapse retries until 200).
 *
 * Content policy unchanged: we record only event metadata (id, sender, type,
 * ts) for participation/unread — message bodies stay in Synapse.
 */

const MESSAGE_TYPES = new Set(['m.room.message', 'm.room.encrypted'])
const TXN_ID_RE = /^\d+\.+\w+$|^[A-Za-z0-9_.-]+$/

export async function appServiceTransactionHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const txnId = url.pathname.split('/').pop() ?? ''

  // Homeserver auth: access_token query param or bearer header.
  const hsToken = ctx.config.matrixHsToken
  if (!hsToken) {
    // Not configured: 403 so Synapse logs the mismatch loudly instead of
    // silently dropping events the operator believes are being delivered.
    writeJson(res, 403, { error: 'Appservice transactions not configured' })
    return
  }
  const presented =
    url.searchParams.get('access_token') ??
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : undefined)
  if (presented !== hsToken) {
    writeJson(res, 401, {
      errcode: 'M_UNKNOWN_TOKEN',
      error: 'Invalid hs_token',
    })
    return
  }

  if (!TXN_ID_RE.test(txnId) || txnId.length > 255) {
    writeJson(res, 400, { errcode: 'M_INVALID_PARAM', error: 'Invalid txnId' })
    return
  }

  // Dedup before any work: a retry of an acked transaction is a no-op ack.
  // Parse BEFORE dedup: a malformed body must stay retryable (400), not be
  // acked-and-dropped.
  type AsEvent = {
    event_id?: string
    room_id?: string
    sender?: string
    type?: string
    origin_server_ts?: number
  }
  let events: AsEvent[] = []
  try {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    events = Array.isArray(body?.events) ? body.events : []
  } catch {
    writeJson(res, 400, {
      errcode: 'M_NOT_JSON',
      error: 'Malformed transaction body',
    })
    return
  }

  // Dedup only once the transaction is processable: a retry of an acked
  // transaction is a no-op ack.
  if (!(await ctx.db.recordAsTransaction(txnId))) {
    writeJson(res, 200, {})
    return
  }

  // Aggregate unread notice per room within this transaction (one SSE event
  // per room, not per message).
  const newByRoom = new Map<string, number>()
  for (const event of events) {
    if (!event.event_id || !event.room_id || !event.type) continue
    const inserted = await ctx.db.insertMatrixEvent({
      roomId: event.room_id,
      eventId: event.event_id,
      sender: event.sender ?? '',
      type: event.type,
      content: '',
      originServerTs: event.origin_server_ts ?? Date.now(),
    })
    if (!inserted) continue

    if (MESSAGE_TYPES.has(event.type) && event.sender) {
      newByRoom.set(event.room_id, (newByRoom.get(event.room_id) ?? 0) + 1)
      const did = await ctx.db.getDidForMxid(event.sender)
      const community = await ctx.db.getCommunityByRoomId(event.room_id)
      if (did && community) {
        await ctx.chatMod.recordMessage(
          did,
          community.communityUri,
          event.room_id,
        )
      }
    }
  }

  for (const [roomId, count] of newByRoom) {
    if (!ctx.events) break
    const community = await ctx.db.getCommunityByRoomId(roomId)
    await ctx.events.publish({
      type: 'chat.unread',
      communityUri: community?.communityUri ?? null,
      payload: { roomId, count },
    })
  }

  ctx.metrics?.asTransactionsTotal?.inc()
  writeJson(res, 200, {})
}

export { HttpError }
