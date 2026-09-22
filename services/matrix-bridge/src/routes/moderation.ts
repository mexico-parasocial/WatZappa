import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AI_CONSENT_POLICY_VERSION } from '../ai-consent.js'
import {
  authorize,
  authorizeOrRespond,
  authorizeUserReadOrRespond,
} from '../authz.js'
import { fetchBeacon, fetchLatestBeacon } from '../drand.js'
import { extractFromText, persistExtractedCard } from '../extraction.js'
import { HttpError, authenticateM8 } from '../m8-auth.js'
import { OpenAIClient } from '../openai-client.js'
import { sendExpoNotifications } from '../push.js'
import type { SortitionRunRow } from '../sortition-runs.js'
import { summarizeCommunityDeliberation } from '../summarize.js'
import type { RouteContext } from './context.js'
import { readBody, writeJson } from './http.js'

/** GET /api/chat-badges (prefix) */
export async function apiChatBadgesHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const did = url.searchParams.get('did')
  const communityUri = url.searchParams.get('community')
  if (!did || !communityUri) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing did or community parameter' }))
    return
  }
  if (
    !(await authorizeOrRespond(ctx, res, auth.did, 'community.read', {
      kind: 'community',
      communityUri,
    })) ||
    !(await authorizeUserReadOrRespond(ctx, res, auth.did, did, communityUri))
  )
    return
  const badges = await ctx.chatMod.recomputeUser(did, communityUri)
  const visibleBadges = badges.filter((b) => b.visibleInChat)
  const hiddenBadges = badges.filter((b) => !b.visibleInChat)
  const participation = await ctx.chatMod.getParticipationSummary(
    did,
    communityUri,
  )
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      did,
      communityUri,
      visibleBadges,
      hiddenBadges,
      participation,
    }),
  )
}

/** GET /api/chat-member-list (prefix) */
export async function apiChatMemberListHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const communityUri = url.searchParams.get('community')
  if (!communityUri) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing community parameter' }))
    return
  }
  if (
    !(await authorizeOrRespond(ctx, res, auth.did, 'community.read', {
      kind: 'community',
      communityUri,
    }))
  )
    return
  const limit = parseInt(url.searchParams.get('limit') || '100', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const members = await ctx.chatMod.getMemberList(communityUri, limit, offset)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ members, total: members.length }))
}

/** POST /api/moderation-report */
export async function apiModerationReportHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const body = await readBody(req)
  const {
    reportedDid,
    reporterDid,
    communityUri,
    reason,
    matrixEventId,
    matrixRoomId,
  } = JSON.parse(body)
  if (!reportedDid || !reporterDid || !communityUri || !reason) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing required fields' }))
    return
  }
  if (auth.did !== reporterDid) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: 'reporterDid must match authenticated DID',
      }),
    )
    return
  }
  // F9: reporting requires active membership (central policy).
  if (
    !(await authorizeOrRespond(ctx, res, auth.did, 'community.contribute', {
      kind: 'community',
      communityUri,
    }))
  )
    return
  // `context` is accepted in the body for compatibility with clients that
  // still send it, and deliberately dropped: F4. The reported message is
  // resolved live from Synapse via matrixEventId at review time.
  await ctx.chatMod.ingestReport({
    reportedDid,
    reporterDid,
    communityUri,
    reason,
    matrixEventId,
    matrixRoomId,
  })
  await ctx.chatMod.recomputeUser(reportedDid, communityUri)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
}

/** POST /api/moderation-sanction */
export async function apiModerationSanctionHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const body = await readBody(req)
  const {
    targetDid,
    sanctionedByDid,
    communityUri,
    type,
    durationMinutes,
    matrixRoomId,
  } = JSON.parse(body)
  if (!targetDid || !sanctionedByDid || !communityUri || !type) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing required fields' }))
    return
  }
  if (auth.did !== sanctionedByDid) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: 'sanctionedByDid must match authenticated DID',
      }),
    )
    return
  }
  // F9: sanctions require the moderator/owner role (central policy).
  if (
    !(await authorizeOrRespond(ctx, res, auth.did, 'community.moderate', {
      kind: 'community',
      communityUri,
    }))
  )
    return
  await ctx.chatMod.ingestSanction({
    targetDid,
    communityUri,
    sanctionType: type,
    durationMinutes,
    sanctionedByDid,
    matrixRoomId,
  })

  // Enforce the sanction in Matrix rooms. Post-CD-M1 the bridge has no
  // DID→MXID mapping to read: the sanction lands on the chat accounts this
  // bridge minted device sessions for under the target DID (operational
  // state — see matrix-projection.ts sessionMxidsForDid).
  try {
    const sessions = await ctx.db.listDeviceSessions(targetDid)
    const targetMxids = [
      ...new Set(
        sessions.filter((s) => s.revokedAt == null).map((s) => s.mxid),
      ),
    ]
    const space = await ctx.db.getSpaceForCommunity(communityUri)
    if (targetMxids.length > 0 && space) {
      const rooms = matrixRoomId
        ? [matrixRoomId]
        : [
            space.spaceId,
            space.chamberA_RoomId,
            space.chamberB_RoomId,
            space.observerRoomId,
          ].filter((r): r is string => Boolean(r))
      for (const targetMxid of targetMxids) {
        for (const roomId of rooms) {
          try {
            if (type === 'ban') {
              await ctx.matrix.banUser(roomId, targetMxid)
            } else if (type === 'mute') {
              await ctx.matrix.muteUser(roomId, targetMxid)
            }
            // 'redact' is informational-only; actual redaction needs an event_id.
          } catch (roomErr: any) {
            ctx.log.warn(
              { err: roomErr, roomId, targetMxid, type },
              'Failed to apply moderation sanction in Matrix room',
            )
          }
        }
      }
    }
  } catch (err: any) {
    ctx.log.error(
      { err, targetDid, communityUri, type },
      'Failed to enforce moderation sanction in Matrix',
    )
  }

  ctx.chatMod.recomputeUser(targetDid, communityUri)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
}

/** GET /api/moderation-dashboard (prefix) */
export async function apiModerationDashboardHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const communityUri = url.searchParams.get('community')
  const modDid = url.searchParams.get('modDid')
  if (!communityUri || !modDid) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing community or modDid parameter' }))
    return
  }
  // The moderator being checked must be the caller. Authorising on the
  // client-supplied modDid alone let any authenticated member read the
  // dashboard by naming someone else's moderator DID, which
  // /api/chat-member-list hands out.
  if (auth.did !== modDid) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'modDid must match authenticated DID' }))
    return
  }
  // F9: being the named moderator is not enough — the caller must hold
  // the moderator or owner role in the community.
  try {
    await authorize(ctx, auth.did, 'community.moderate', {
      kind: 'community',
      communityUri,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      writeJson(res, err.statusCode, { error: err.message })
      return
    }
    throw err
  }

  const dashboard = await ctx.chatMod.getDashboard(communityUri)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(dashboard))
}

/** POST /api/moderation-recompute */
export async function apiModerationRecomputeHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const body = await readBody(req)
  const { communityUri } = JSON.parse(body)
  if (!communityUri) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing communityUri' }))
    return
  }
  // F9: central policy instead of a hand-rolled stats check.
  if (
    !(await authorizeOrRespond(ctx, res, auth.did, 'community.moderate', {
      kind: 'community',
      communityUri,
    }))
  )
    return
  const count = await ctx.chatMod.recomputeCommunity(communityUri)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ recomputed: count }))
}

/** GET /api/user-chat-preferences (prefix) */
export async function apiUserChatPreferencesGETHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  await authenticateM8(req, ctx.config)
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const did = url.searchParams.get('did')
  if (!did) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing did parameter' }))
    return
  }
  const prefs = await ctx.db.getChatPreferences(did)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(prefs))
}

/** POST /api/user-chat-preferences */
export async function apiUserChatPreferencesPOSTHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const body = await readBody(req)
  const { did, showChatBadges } = JSON.parse(body)
  if (!did || typeof showChatBadges !== 'boolean') {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing did or showChatBadges' }))
    return
  }
  if (auth.did !== did) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'did must match authenticated DID' }))
    return
  }
  await ctx.db.setChatPreferences(did, showChatBadges)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))

  // ── Third-party LLM processing consent (OD-3) ──
  // Read and write are scoped to the authenticated user and take no `did`
  // parameter: whether someone consented to AI processing is their own
  // business, and a lookup by DID would make it enumerable.
}
