import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { AI_CONSENT_POLICY_VERSION } from '../ai-consent.js'
import { authenticateM8, HttpError } from '../m8-auth.js'
import { authorize } from '../authz.js'
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
      // Read the (optional) JSON body: { friendlyName?, deviceId? }
      let friendlyName: string | undefined
      let requestedDeviceId: string | undefined
      try {
        const parsed = JSON.parse(await readBody(req))
        if (typeof parsed.friendlyName === 'string')
          friendlyName = parsed.friendlyName.slice(0, 100)
        if (
          typeof parsed.deviceId === 'string' &&
          /^[A-Za-z0-9_.=-]{1,128}$/.test(parsed.deviceId)
        )
          requestedDeviceId = parsed.deviceId
      } catch {
        // empty body is fine
      }
      const userAgent = req.headers['user-agent']?.slice(0, 200)

      const deviceId =
        requestedDeviceId ?? `PARA-${randomUUID().replace(/-/g, '').slice(0, 16)}`
      const session = await ctx.matrix.appServiceLogin(
        mxid,
        deviceId,
        friendlyName ?? userAgent,
      )

      const id = randomUUID()
      const now = new Date().toISOString()
      await ctx.db.createDeviceSession({
        id,
        did,
        mxid,
        deviceId: session.deviceId,
        friendlyName: friendlyName ?? null,
        userAgent: userAgent ?? null,
        createdAt: now,
        lastSeenAt: now,
        revokedAt: null,
      })

      writeJson(res, 200, {
        accessToken: session.accessToken,
        deviceId: session.deviceId,
        sessionId: id,
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
      // F9: membership alone is not enough — the caller's chamber assignment
      // must match the room's chamber (observers only reach main/observers).
      try {
        await authorize(ctx, did, 'chamber.read', { kind: 'room', roomId })
      } catch (err) {
        if (err instanceof HttpError) {
          writeJson(res, err.statusCode, { error: err.message })
          return
        }
        throw err
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

/**
 * GET /api/devices — the caller's Matrix device sessions, newest first.
 * Includes revoked sessions so clients can render their full device history.
 */
export async function apiListDevicesHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const sessions = await ctx.db.listDeviceSessions(auth.did)
  writeJson(res, 200, {
    devices: sessions.map((d) => ({
      sessionId: d.id,
      deviceId: d.deviceId,
      friendlyName: d.friendlyName,
      userAgent: d.userAgent,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
      revoked: d.revokedAt != null,
    })),
  })
}

/**
 * POST /api/devices/revoke — body: { sessionId }. Deactivates the device on
 * the homeserver (killing its access token) and marks the session revoked.
 */
export async function apiRevokeDeviceHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  let sessionId: string | undefined
  try {
    const parsed = JSON.parse(await readBody(req))
    if (typeof parsed.sessionId === 'string') sessionId = parsed.sessionId
  } catch {
    // fallthrough to validation error
  }
  if (!sessionId) {
    writeJson(res, 400, { error: 'sessionId is required' })
    return
  }

  const session = await ctx.db.getDeviceSession(sessionId)
  if (!session || session.did !== auth.did) {
    writeJson(res, 404, { error: 'Device session not found' })
    return
  }
  if (session.revokedAt) {
    writeJson(res, 200, { revoked: true, alreadyRevoked: true })
    return
  }

  await ctx.matrix.adminDeactivateDevice(session.mxid, session.deviceId)
  await ctx.db.revokeDeviceSession(auth.did, sessionId)
  writeJson(res, 200, { revoked: true })
}
