import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { AI_CONSENT_POLICY_VERSION } from '../ai-consent.js'
import { authenticateM8 } from '../m8-auth.js'
import { fetchBeacon, fetchLatestBeacon } from '../drand.js'
import { extractFromText, persistExtractedCard } from '../extraction.js'
import { OpenAIClient } from '../openai-client.js'
import { summarizeCommunityDeliberation } from '../summarize.js'
import type { SortitionRunRow } from '../sortition-runs.js'
import { sendExpoNotifications } from '../push.js'
import type { RouteContext } from './context.js'
import { readBody, writeJson } from './http.js'

/** POST /_matrix/push/v1/notify */
export async function matrixPushV1NotifyHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const body = await readBody(req)
      const payload = JSON.parse(body)
      const notification = payload.notification

      if (!notification) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing notification' }))
        return
      }

      const roomId = notification.room_id as string
      const devices = (notification.devices || []) as Array<{
        app_id: string
        pushkey: string
        pushkey_ts?: number
      }>

      // Find community info for deep linking
      const community = await ctx.db.getCommunityByRoomId(roomId)
      const senderMxid = notification.sender as string | undefined
      // Build Expo data payload for deep linking
      const expoData: Record<string, unknown> = {
        reason: 'matrix-message',
        roomId,
        communityUri: community?.communityUri || '',
        communityName: community?.slug || 'Comunidad',
        senderName: senderMxid?.split(':')[0]?.replace('@', '') || 'Alguien',
      }

      const pushTokens = devices
        .map((d) => d.pushkey)
        .filter((k) => k && k.startsWith('ExponentPushToken'))

      if (pushTokens.length > 0) {
        try {
          await sendExpoNotifications({
            tokens: pushTokens,
            title: community?.slug || 'PARA Chat',
            body: `Nuevo mensaje en ${community?.slug || 'tu comunidad'}`,
            data: expoData,
          })
          ctx.log.debug(
            { roomId, tokens: pushTokens.length },
            'Sent push notification',
          )
        } catch (err: any) {
          ctx.log.error({ err, roomId }, 'Failed to send push notification')
        }
      }

      // Respond as Matrix Push Gateway spec requires
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ rejected: [] }))
    
}
