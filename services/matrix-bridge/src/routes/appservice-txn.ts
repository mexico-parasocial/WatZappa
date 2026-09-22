import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { HttpError } from '../m8-auth.js'
import {
  type MatrixEventMetadata,
  ingestMatrixEvents,
} from '../matrix-ingestion.js'
import type { RouteContext } from './context.js'
import { readBody, writeJson } from './http.js'

const MAX_TRANSACTION_BYTES = 4 * 1024 * 1024
const MAX_EVENTS = 1000

function matches(token: string | undefined, expected: string): boolean {
  if (!token) return false
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Synapse's stable PUT transaction endpoint, with legacy POST compatibility. */
export async function appServiceTransactionHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  if (req.method !== 'PUT' && req.method !== 'POST') {
    writeJson(res, 405, { errcode: 'M_UNRECOGNIZED', error: 'Use PUT' })
    return
  }
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const token = ctx.config.matrixHsToken
  const queryToken = url.searchParams.get('access_token') ?? undefined
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7).trim()
    : undefined
  if (
    !token ||
    !(bearer || queryToken) ||
    (bearer !== undefined && !matches(bearer, token)) ||
    (queryToken !== undefined && !matches(queryToken, token))
  ) {
    writeJson(res, 403, { errcode: 'M_FORBIDDEN', error: 'Invalid hs_token' })
    return
  }
  const txnId = url.pathname.split('/').pop() ?? ''
  if (!/^[A-Za-z0-9_.-]{1,255}$/.test(txnId)) {
    writeJson(res, 400, { errcode: 'M_INVALID_PARAM', error: 'Invalid txnId' })
    return
  }
  let events: MatrixEventMetadata[]
  try {
    const body = JSON.parse(await readBody(req, MAX_TRANSACTION_BYTES))
    if (!Array.isArray(body?.events) || body.events.length > MAX_EVENTS)
      throw new HttpError(400, 'Invalid events array')
    events = body.events.map((event: unknown) => {
      if (!event || typeof event !== 'object')
        throw new HttpError(400, 'Invalid event')
      const e = event as Record<string, unknown>
      if (
        ['event_id', 'room_id', 'sender', 'type'].some(
          (k) =>
            typeof e[k] !== 'string' ||
            !(e[k] as string).length ||
            (e[k] as string).length > 1024,
        )
      )
        throw new HttpError(400, 'Invalid event metadata')
      if (
        !Number.isSafeInteger(e.origin_server_ts) ||
        (e.origin_server_ts as number) < 0
      )
        throw new HttpError(400, 'Invalid event timestamp')
      return {
        eventId: e.event_id as string,
        roomId: e.room_id as string,
        sender: e.sender as string,
        type: e.type as string,
        originServerTs: e.origin_server_ts as number,
      }
    })
  } catch (err) {
    writeJson(res, err instanceof HttpError ? err.statusCode : 400, {
      errcode: 'M_BAD_JSON',
      error: err instanceof HttpError ? err.message : 'Malformed transaction',
    })
    return
  }
  await ingestMatrixEvents(ctx.db, events, ctx.events, txnId)
  ctx.metrics?.asTransactionsTotal?.inc()
  writeJson(res, 200, {})
}
