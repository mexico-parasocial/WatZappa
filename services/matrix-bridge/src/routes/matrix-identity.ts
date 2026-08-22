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

/** ANY /api/space-for-community (prefix) */
export async function apiSpaceForCommunityHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('uri')
      if (!communityUri) {
        writeJson(res, 400, { error: 'Missing uri parameter' })
        return
      }
      if (!(await ctx.db.isActiveCommunityMember(auth.did, communityUri))) {
        writeJson(res, 403, { error: 'Not an active community member' })
        return
      }
      const mapping = await ctx.db.getSpaceForCommunity(communityUri)
      if (!mapping) {
        writeJson(res, 404, { error: 'Space not found for community' })
        return
      }
      writeJson(res, 200, { spaceId: mapping.spaceId, slug: mapping.slug })
    
}

/** POST /api/matrix-token */
export async function apiMatrixTokenHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const did = auth.did
      const mxid = await ctx.db.getMxidForDid(did)
      if (!mxid) {
        writeJson(res, 404, { error: 'User not mapped to Matrix' })
        return
      }
      const tokenData = await ctx.matrix.generateUserToken(mxid)
      writeJson(res, 200, {
        accessToken: tokenData.accessToken,
        deviceId: tokenData.deviceId,
        userId: mxid,
        homeServer: ctx.config.matrixHomeserverUrl
          .replace('http://', 'https://')
          .replace(':8008', ''),
      })
    
}

/** POST /api/push-token */
export async function apiPushTokenHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { expoPushToken, platform } = JSON.parse(body)
      const did = auth.did
      if (!expoPushToken) {
        writeJson(res, 400, { error: 'Missing expoPushToken' })
        return
      }

      await ctx.db.setPushToken(did, expoPushToken, platform || 'unknown')

      // Register pusher in Synapse so it knows where to send notifications
      const mxid = await ctx.db.getMxidForDid(did)
      if (mxid) {
        try {
          const tokenData = await ctx.matrix.generateUserToken(mxid)
          await ctx.matrix.setPusherWithUserToken(
            mxid,
            tokenData.accessToken,
            expoPushToken,
            'com.para.app',
            ctx.config.pushGatewayUrl,
          )
          ctx.log.info({ did, mxid }, 'Registered Matrix pusher')
        } catch (err: any) {
          ctx.log.error({ err, did, mxid }, 'Failed to register Matrix pusher')
          // Don't fail the request — token is saved, pusher can be retried
        }
      }

      writeJson(res, 200, { ok: true })
    
}

/** POST /api/mark-read */
export async function apiMarkReadHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { roomId, eventId } = JSON.parse(body)
      const did = auth.did
      if (!roomId) {
        writeJson(res, 400, { error: 'Missing roomId' })
        return
      }
      const community = await ctx.db.getCommunityByRoomId(roomId)
      if (
        !community ||
        !(await ctx.db.isActiveCommunityMember(did, community.communityUri))
      ) {
        writeJson(res, 403, { error: 'Not an active community member' })
        return
      }
      // If no eventId provided, mark all current events as read
      const targetEventId =
        eventId || (await ctx.db.getRecentEvents(roomId, 1))[0]?.event_id
      if (targetEventId) {
        await ctx.db.setReadMarker(did, roomId, targetEventId)
      }
      writeJson(res, 200, { ok: true })
    
}

/** GET /api/unread (prefix) */
export async function apiUnreadHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const did = auth.did
      const communities = await ctx.db.getUnreadCountsForDid(did)
      const total = communities.reduce((sum, c) => sum + c.unread, 0)
      writeJson(res, 200, { unread: total, communities })
    
}

/** GET /api/rooms */
export async function apiRoomsHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const rooms = await ctx.db.getUnreadCountsForDid(auth.did)
      writeJson(res, 200, { rooms })
    
}
