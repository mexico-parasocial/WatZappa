import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendExpoNotifications } from '../push.js'
import type { RouteContext } from './context.js'
import { readBody, writeJson } from './http.js'

/** POST /_matrix/push/v1/notify */
export async function matrixPushV1NotifyHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const body = await readBody(req)
  const payload = JSON.parse(body)
  const notification = payload.notification

  if (
    !notification ||
    !Array.isArray(notification.devices) ||
    notification.devices.length > 1000 ||
    notification.devices.some(
      (d: unknown) =>
        !d ||
        typeof d !== 'object' ||
        !('pushkey' in d) ||
        typeof d.pushkey !== 'string',
    )
  ) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing notification' }))
    return
  }

  const roomId = notification.room_id as string
  const eventId = notification.event_id as string | undefined
  if (
    eventId !== undefined &&
    (typeof eventId !== 'string' || typeof roomId !== 'string')
  ) {
    writeJson(res, 400, { error: 'Invalid event notification' })
    return
  }
  const devices = (notification.devices || []) as Array<{
    app_id: string
    pushkey: string
    pushkey_ts?: number
  }>

  // Find community info for deep linking
  const community =
    typeof roomId === 'string'
      ? await ctx.db.getCommunityByRoomId(roomId)
      : undefined
  const senderMxid = notification.sender as string | undefined
  // Build Expo data payload for deep linking
  const expoData: Record<string, unknown> = {
    reason: eventId ? 'matrix-message' : 'matrix-unread',
    eventId,
    roomId,
    communityUri: community?.communityUri || '',
    communityName: community?.slug || 'Comunidad',
    senderName: senderMxid?.split(':')[0]?.replace('@', '') || 'Alguien',
  }

  const pushTokens = [
    ...new Set(
      devices
        .map((d) => d.pushkey)
        .filter(
          (k) =>
            typeof k === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(k),
        ),
    ),
  ]

  const rejected = devices
    .map((d) => d.pushkey)
    .filter((k) => !pushTokens.includes(k))
  if (pushTokens.length > 0) {
    const owner = randomUUID()
    const claims = new Map<string, string>()
    try {
      if (eventId) {
        for (const token of pushTokens) {
          const id = createHash('sha256')
            .update(JSON.stringify([roomId, eventId, token]))
            .digest('hex')
          if (await ctx.db.claimPushDelivery(id, token, owner, Date.now()))
            claims.set(token, id)
          else {
            const previous = await ctx.db.getPushDelivery(id)
            if (!previous || previous.state === 'sending')
              throw new Error('Push delivery is in progress')
            if (previous.state === 'rejected') rejected.push(token)
          }
        }
      }
      const expired = await sendExpoNotifications({
        tokens: eventId ? [...claims.keys()] : pushTokens,
        title: eventId ? community?.slug || 'PARA Chat' : undefined,
        body: eventId
          ? `Nuevo mensaje en ${community?.slug || 'tu comunidad'}`
          : undefined,
        data: expoData,
        badge:
          Number.isSafeInteger(notification.counts?.unread) &&
          notification.counts.unread >= 0
            ? notification.counts.unread
            : undefined,
        onTicket: eventId
          ? async (token, ticket) => {
              await ctx.db.completePushDelivery(
                claims.get(token)!,
                owner,
                ticket.id ?? null,
                ticket.status === 'error',
                Date.now(),
              )
            }
          : undefined,
      })
      rejected.push(...expired)
      ctx.log.debug(
        { roomId, tokens: pushTokens.length },
        'Push request processed; provider acceptance pending',
      )
    } catch (err: any) {
      ctx.log.error({ err, roomId }, 'Failed to send push notification')
      writeJson(res, 502, { error: 'Push delivery unavailable' })
      return
    } finally {
      // @NOTE accepted tickets survive partial failures; only unsubmitted claims are retryable.
      for (const id of claims.values())
        await ctx.db.releasePushDelivery(id, owner)
    }
  }

  // Respond as Matrix Push Gateway spec requires
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ rejected }))
}
