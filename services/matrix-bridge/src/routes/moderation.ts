import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AI_CONSENT_POLICY_VERSION } from '../ai-consent.js'
import {
  authorize,
  authorizeOrRespond,
  authorizeUserReadOrRespond,
  decideCommunity,
} from '../authz.js'
import {
  MAX_SANCTION_MINUTES,
  MAX_SANCTION_REASON_LENGTH,
  type SanctionKind,
  isMemberReportReason,
  isMessageReportReason,
  sanctionKindsInForce,
} from '../chat-moderation.js'
import { fetchBeacon, fetchLatestBeacon } from '../drand.js'
import { extractFromText, persistExtractedCard } from '../extraction.js'
import { HttpError, authenticateM8 } from '../m8-auth.js'
import { OpenAIClient } from '../openai-client.js'
import { sendExpoNotifications } from '../push.js'
import {
  type EnforcementResult,
  createSanctionEnforcer,
} from '../sanction-enforcement.js'
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
  // Who is at risk or sanctioned is for moderators (and the member themself).
  // The app also hides these, but the app is not the boundary: this is.
  const isModerator = decideCommunity(
    await ctx.db.getCommunityMembership(auth.did, communityUri),
    'community.moderate',
  ).allowed
  const members = await ctx.chatMod.getMemberList(communityUri, limit, offset, {
    did: auth.did,
    isModerator,
  })
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ members, total: members.length }))
}

/**
 * POST /api/moderation-report
 *
 * Two shapes. A message report names the room and event and a reason from
 * MESSAGE_REPORT_REASONS; the bridge resolves who sent it (the client knows
 * only an MXID and must not need a DID). A member report, with no event,
 * names `reportedDid` directly, as before.
 */
export async function apiModerationReportHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const body = await readBody(req)
  const {
    reportedDid: claimedReportedDid,
    reporterDid,
    communityUri,
    reason,
    matrixEventId,
    matrixRoomId,
  } = JSON.parse(body)
  const isMessageReport = matrixEventId !== undefined
  if (
    !reporterDid ||
    !communityUri ||
    !reason ||
    (isMessageReport ? !matrixRoomId : !claimedReportedDid)
  ) {
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
  if (
    isMessageReport
      ? !isMessageReportReason(reason)
      : !isMemberReportReason(reason)
  ) {
    writeJson(res, 400, {
      error: 'reason must be one of the fixed report reasons',
      code: 'InvalidReason',
    })
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

  let reportedDid: string = claimedReportedDid
  if (isMessageReport) {
    const resolved = await ctx.chatMod.resolveReportedMessage({
      reporterDid,
      communityUri,
      matrixRoomId,
      matrixEventId,
      reportedDid: claimedReportedDid,
    })
    if (!resolved.ok) {
      const status =
        resolved.code === 'EventNotFound'
          ? 404
          : resolved.code === 'SenderNotAttributable'
            ? 422
            : 400
      writeJson(res, status, {
        error: 'The reported message cannot be accepted',
        code: resolved.code,
      })
      return
    }
    reportedDid = resolved.reportedDid
  }

  // `context` is accepted in the body for compatibility with clients that
  // still send it, and deliberately dropped: F4, D2. Moderators read the
  // reported message in the room, from their own client.
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

function parseJson(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body || '{}')
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // fall through
  }
  throw new HttpError(400, 'Invalid JSON body')
}

function mergeEnforcement(results: EnforcementResult[]): EnforcementResult {
  const accounts = Math.max(0, ...results.map((r) => r.accounts))
  const applied = results.reduce((n, r) => n + r.applied, 0)
  const failed = results.reduce((n, r) => n + r.failed, 0)
  const status =
    accounts === 0
      ? 'pending'
      : failed === 0
        ? 'applied'
        : applied === 0
          ? 'failed'
          : 'partial'
  return { status, accounts, applied, failed }
}

/**
 * POST /api/moderation-sanction
 *
 * Mute or ban a member for a community. The sanction is recorded against the
 * DID and enforced in Matrix on the accounts the bridge knows; the projection
 * enforces it again whenever the member next interacts, and for a chat key it
 * has not seen. The response says how far enforcement got, so a moderator is
 * never told a ban worked when it did not.
 *
 * Who may be sanctioned: nobody sanctions themself or an owner, and only an
 * owner sanctions a moderator.
 */
export async function apiModerationSanctionHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const body = parseJson(await readBody(req))
  const { targetDid, sanctionedByDid, communityUri, type, durationMinutes } =
    body as Record<string, any>
  const reason = body.reason
  if (!targetDid || !sanctionedByDid || !communityUri || !type) {
    writeJson(res, 400, { error: 'Missing required fields' })
    return
  }
  if (auth.did !== sanctionedByDid) {
    writeJson(res, 403, {
      error: 'sanctionedByDid must match authenticated DID',
    })
    return
  }
  if (type !== 'mute' && type !== 'ban') {
    writeJson(res, 400, {
      error: 'type must be "mute" or "ban"',
      code: 'InvalidSanctionType',
    })
    return
  }
  if (
    durationMinutes != null &&
    !(
      Number.isInteger(durationMinutes) &&
      durationMinutes >= 1 &&
      durationMinutes <= MAX_SANCTION_MINUTES
    )
  ) {
    writeJson(res, 400, {
      error: `durationMinutes must be a whole number from 1 to ${MAX_SANCTION_MINUTES}`,
      code: 'InvalidDuration',
    })
    return
  }
  if (
    reason != null &&
    (typeof reason !== 'string' || reason.length > MAX_SANCTION_REASON_LENGTH)
  ) {
    writeJson(res, 400, {
      error: `reason must be text of at most ${MAX_SANCTION_REASON_LENGTH} characters`,
      code: 'InvalidReason',
    })
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
  if (targetDid === auth.did) {
    writeJson(res, 400, {
      error: 'You cannot sanction yourself',
      code: 'SelfSanction',
    })
    return
  }
  await ctx.firehose.refreshMembership(communityUri, targetDid)
  const actor = await ctx.db.getCommunityMembership(auth.did, communityUri)
  const target = await ctx.db.getCommunityMembership(targetDid, communityUri)
  const targetRoles = target?.roles ?? []
  if (targetRoles.includes('owner')) {
    writeJson(res, 403, {
      error: 'An owner cannot be sanctioned',
      code: 'CannotSanctionOwner',
    })
    return
  }
  if (targetRoles.includes('moderator') && !actor?.roles.includes('owner')) {
    writeJson(res, 403, {
      error: 'Only an owner can sanction a moderator',
      code: 'CannotSanctionModerator',
    })
    return
  }

  const kind: SanctionKind = type
  await ctx.chatMod.ingestSanction({
    targetDid,
    communityUri,
    sanctionType: kind,
    durationMinutes: durationMinutes ?? null,
    sanctionedByDid: auth.did,
    reason: typeof reason === 'string' ? reason.trim() || null : null,
  })
  const enforcement = await createSanctionEnforcer(ctx).apply(
    targetDid,
    communityUri,
    kind,
  )
  await ctx.chatMod.recomputeUser(targetDid, communityUri)
  const inForce = await ctx.chatMod.getSanction(targetDid, communityUri)
  writeJson(res, 200, {
    ok: true,
    sanction: inForce && { type: inForce.type, until: inForce.until },
    enforcement,
  })
}

/**
 * POST /api/moderation-sanction-lift
 *
 * End a mute or ban before it runs out (`type` omitted: both). Safe to repeat:
 * when nothing is in force it still retries the lift in Matrix, which is how a
 * moderator recovers from an `enforcement` that came back `partial`.
 */
export async function apiModerationLiftHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const { targetDid, communityUri, type } = parseJson(
    await readBody(req),
  ) as Record<string, any>
  if (!targetDid || !communityUri) {
    writeJson(res, 400, { error: 'Missing required fields' })
    return
  }
  if (type != null && type !== 'mute' && type !== 'ban') {
    writeJson(res, 400, {
      error: 'type must be "mute" or "ban"',
      code: 'InvalidSanctionType',
    })
    return
  }
  if (
    !(await authorizeOrRespond(ctx, res, auth.did, 'community.moderate', {
      kind: 'community',
      communityUri,
    }))
  )
    return

  const kinds: SanctionKind[] = type ? [type] : ['ban', 'mute']
  const inForce = sanctionKindsInForce(
    await ctx.db.getSanctionEvents(targetDid, communityUri),
  )
  const toLift = kinds.filter((kind) => inForce.includes(kind))
  for (const kind of toLift) {
    await ctx.chatMod.ingestLift({
      targetDid,
      communityUri,
      sanctionType: kind,
      liftedByDid: auth.did,
      reason: 'lifted by moderator',
    })
  }
  const enforcer = createSanctionEnforcer(ctx)
  const enforcement = mergeEnforcement(
    await Promise.all(
      kinds.map((kind) => enforcer.lift(targetDid, communityUri, kind)),
    ),
  )
  await ctx.chatMod.recomputeUser(targetDid, communityUri)
  writeJson(res, 200, { ok: true, lifted: toLift.length > 0, enforcement })
}

/**
 * POST /api/moderation-report-dismiss
 *
 * Close the reports against one message, or (no `matrixEventId`) everything
 * reported about a member so far. They leave the queue and stop counting
 * toward risk badges.
 */
export async function apiModerationDismissHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const { reportedDid, communityUri, matrixEventId } = parseJson(
    await readBody(req),
  ) as Record<string, any>
  if (!reportedDid || !communityUri) {
    writeJson(res, 400, { error: 'Missing required fields' })
    return
  }
  if (
    !(await authorizeOrRespond(ctx, res, auth.did, 'community.moderate', {
      kind: 'community',
      communityUri,
    }))
  )
    return
  await ctx.chatMod.dismissReports({
    reportedDid,
    communityUri,
    matrixEventId: typeof matrixEventId === 'string' ? matrixEventId : null,
    dismissedByDid: auth.did,
  })
  writeJson(res, 200, { ok: true })
}

/**
 * GET /api/moderation-reports?community=…&modDid=… (prefix)
 *
 * The report queue for one community, for its moderators and owners only.
 * Grouped by reported message; reporter identities and message text are not
 * returned (see ModerationReportGroup).
 */
export async function apiModerationReportsHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const communityUri = url.searchParams.get('community')
  const modDid = url.searchParams.get('modDid')
  if (!communityUri || !modDid) {
    writeJson(res, 400, { error: 'Missing community or modDid parameter' })
    return
  }
  if (auth.did !== modDid) {
    writeJson(res, 403, { error: 'modDid must match authenticated DID' })
    return
  }
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
  const reports = await ctx.chatMod.listReports(communityUri)
  writeJson(res, 200, { reports })
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
  const auth = await authenticateM8(req, ctx.config)
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const did = url.searchParams.get('did')
  if (!did) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing did parameter' }))
    return
  }
  // Whether someone shows chat badges is theirs to read; the POST is already
  // scoped to the caller, and the app only ever reads its own.
  if (auth.did !== did) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'did must match authenticated DID' }))
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
