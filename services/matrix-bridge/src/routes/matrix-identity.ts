import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AI_CONSENT_POLICY_VERSION } from '../ai-consent.js'
import { authorize, resolveRoom } from '../authz.js'
import { fetchBeacon, fetchLatestBeacon } from '../drand.js'
import { extractFromText, persistExtractedCard } from '../extraction.js'
import {
  BRIDGE_AUDIENCES,
  mxidFromVerifiedAssertion,
} from '../identity-proof.js'
import { HttpError, authenticateM8 } from '../m8-auth.js'
import { MatrixLoginUnavailableError } from '../matrix-login-error.js'
import { OpenAIClient } from '../openai-client.js'
import { sendExpoNotifications } from '../push.js'
import type { SortitionRunRow } from '../sortition-runs.js'
import { summarizeCommunityDeliberation } from '../summarize.js'
import type { RouteContext } from './context.js'
import { readBody, writeJson } from './http.js'

/** ANY /api/space-for-community (prefix) */
export async function apiSpaceForCommunityHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
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

/**
 * GET /api/matrix-identity — gone (CD-M1). The v1 endpoint read a DID→MXID
 * mapping that no longer exists; the answer is now derived from a verified
 * proof. Explicit 410 rather than a silent 404 so rolling clients get an
 * actionable migration signal instead of guessing.
 */
export async function apiMatrixIdentityGoneHandler(
  _req: IncomingMessage,
  res: ServerResponse,
  _ctx: RouteContext,
): Promise<void> {
  writeJson(res, 410, {
    error: 'GONE',
    message:
      'GET /api/matrix-identity was removed with the DID→MXID mapping (CD-M1/CD-M6)',
    migrate: {
      challenge: 'POST /api/matrix-challenge',
      identity:
        'POST /api/matrix-identity with a SignedAssertion (audience para-matrix-bridge/identity.v1)',
    },
  })
}

/**
 * POST /api/matrix-challenge — issue the one-time challenge that binds the
 * next proof of possession to this M8 session (CD-M4/CD-M6).
 *
 * The client signs the challenge with identity_priv; consuming it here is
 * single-use, TTL-bounded and bound to the issuing DID. In memory only — see
 * ChallengeStore for why a persisted challenge would be a correlation
 * artifact with no benefit.
 */
export async function apiMatrixChallengeHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const issued = ctx.challenges.issue(auth.did)
  writeJson(res, 200, {
    challenge: issued.challenge,
    expiresAt: issued.expiresAt,
    purpose: 'matrix-login',
  })
}

/**
 * Interaction-time access reconciliation (CD-M6): now that the proof has
 * named the caller's account, settle every membership verdict governance has
 * recorded for the DID — role catch-up for active communities, bans for
 * removed ones, including MAS-native accounts with no minted session.
 * Deliberately best-effort: reconciliation must never fail an otherwise
 * valid request; the next interaction retries it.
 */
async function reconcileAccess(
  ctx: RouteContext,
  did: string,
  mxid: string,
): Promise<void> {
  try {
    await ctx.projection.reconcileMemberAccess(did, mxid)
  } catch (err: any) {
    ctx.log.warn(
      { err, did },
      'Access reconciliation failed; retried at next interaction',
    )
  }
}

/** Read the body once and extract the SignedAssertion plus any other fields.
 *  The request stream cannot be re-read, so every handler parses here.
 *  Accepts the assertion at the top level or nested under `assertion`
 *  alongside other request fields (deviceId, communityUri, …). */
async function readAssertionBody(
  req: IncomingMessage,
): Promise<{ signed: { assertion: any; signature: string }; body: any }> {
  const raw = await readBody(req)
  let parsed: any
  try {
    parsed = JSON.parse(raw || '{}')
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
  const isSigned = (v: any) =>
    !!v &&
    typeof v === 'object' &&
    typeof v.assertion === 'object' &&
    typeof v.signature === 'string'
  let signed = parsed
  if (!isSigned(parsed) && isSigned(parsed?.assertion)) {
    signed = parsed.assertion
  }
  if (!isSigned(signed)) {
    throw new HttpError(400, 'Missing assertion (SignedAssertion)')
  }
  return { signed, body: parsed }
}

/**
 * POST /api/matrix-identity — the caller's Matrix identity, derived from the
 * identity key it just proved possession of.
 *
 * Post-CD-M1 the MXID is `base32(sha256("para-id/matrix-localpart/v1" ‖
 * identity_pub))[0..20]` — a pure function of the presented public key. There
 * is no mapping to read: the client can (and does, via iM8) derive its own
 * MXID locally, and this endpoint is the cross-check that both sides agree on
 * the derivation plus the point at which the Synapse account is ensured to
 * exist. It mints no session, no device and no token.
 */
export async function apiMatrixIdentityHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const { signed } = await readAssertionBody(req)
  const challenge = signed.assertion.challenge
  if (
    typeof challenge !== 'string' ||
    !ctx.challenges.consume(challenge, auth.did)
  ) {
    writeJson(res, 401, { error: 'Unknown, expired or reused challenge' })
    return
  }
  const mxid = mxidFromVerifiedAssertion(
    signed,
    { purpose: 'matrix-login', audience: BRIDGE_AUDIENCES.identity, challenge },
    ctx.config.matrixServerName,
  )
  if (!mxid) {
    writeJson(res, 401, { error: 'Invalid identity proof' })
    return
  }
  try {
    if (!(await ctx.matrix.userExists(mxid))) {
      await ctx.matrix.createUser(mxid)
    }
  } catch (err: any) {
    ctx.log.warn({ err, mxid }, 'Could not ensure Matrix account exists')
    // The account is also ensured at verified join / session mint; report
    // identity even if provisioning is temporarily unavailable.
  }
  await reconcileAccess(ctx, auth.did, mxid)
  writeJson(res, 200, {
    userId: mxid,
    homeServer: ctx.config.matrixPublicHomeserverUrl,
    /**
     * How this deployment expects a client to obtain a device session.
     * `oidc` means: run the homeserver's authorization-code flow yourself.
     * Never treat a bridge credential as a substitute.
     */
    loginFlow: 'oidc' as const,
  })
}

export async function apiMatrixTokenHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const did = auth.did
  const { signed, body } = await readAssertionBody(req)
  const challenge = signed.assertion.challenge
  if (
    typeof challenge !== 'string' ||
    !ctx.challenges.consume(challenge, did)
  ) {
    writeJson(res, 401, { error: 'Unknown, expired or reused challenge' })
    return
  }
  const mxid = mxidFromVerifiedAssertion(
    signed,
    { purpose: 'matrix-login', audience: BRIDGE_AUDIENCES.session, challenge },
    ctx.config.matrixServerName,
  )
  if (!mxid) {
    writeJson(res, 401, { error: 'Invalid identity proof' })
    return
  }

  let friendlyName: string | undefined
  let requestedDeviceId: string | undefined
  if (typeof body.friendlyName === 'string')
    friendlyName = body.friendlyName.slice(0, 100)
  if (
    typeof body.deviceId === 'string' &&
    /^[A-Za-z0-9_.=-]{1,128}$/.test(body.deviceId)
  ) {
    requestedDeviceId = body.deviceId
  }
  const userAgent = req.headers['user-agent']?.slice(0, 200)

  if (!(await ctx.matrix.userExists(mxid))) {
    await ctx.matrix.createUser(mxid)
  }

  const deviceId =
    requestedDeviceId ?? `PARA-${randomUUID().replace(/-/g, '').slice(0, 16)}`
  let session
  try {
    session = await ctx.matrix.appServiceLogin(
      mxid,
      deviceId,
      friendlyName ?? userAgent,
    )
  } catch (err) {
    if (!(err instanceof MatrixLoginUnavailableError)) throw err
    writeJson(res, 503, {
      error: 'MATRIX_CLIENT_LOGIN_REQUIRED',
      message: 'Authorize this device through the Matrix homeserver login flow',
    })
    return
  }

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
  await reconcileAccess(ctx, did, mxid)

  writeJson(res, 200, {
    accessToken: session.accessToken,
    deviceId: session.deviceId,
    sessionId: id,
    userId: mxid,
    homeServer: ctx.config.matrixPublicHomeserverUrl,
  })
}

/**
 * POST /api/matrix-attest — register a client-managed Matrix session.
 *
 * For deployments where the homeserver login is MAS-native (the current
 * production shape), the bridge never mints the client's Matrix session and
 * therefore never learns which device to attribute, moderate, revoke or
 * re-permission. This endpoint closes that: the client presents the same
 * CD-M4 proof as everywhere else (audience `attest`) plus its MAS device id,
 * and the bridge records a device-session row for the derived MXID — no
 * token is minted, the client's own MAS session remains the session.
 *
 * With that row: chat-message attribution counts the sender, moderation
 * sanctions resolve the target, removal deactivates the device, and role
 * changes reach it — the same operational treatment bridge-minted sessions
 * get, by the member's own attestation instead of by bridge custody.
 */
export async function apiMatrixAttestHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const { signed, body } = await readAssertionBody(req)
  const challenge = signed.assertion.challenge
  if (
    typeof challenge !== 'string' ||
    !ctx.challenges.consume(challenge, auth.did)
  ) {
    writeJson(res, 401, { error: 'Unknown, expired or reused challenge' })
    return
  }
  const mxid = mxidFromVerifiedAssertion(
    signed,
    { purpose: 'matrix-login', audience: BRIDGE_AUDIENCES.attest, challenge },
    ctx.config.matrixServerName,
  )
  if (!mxid) {
    writeJson(res, 401, { error: 'Invalid identity proof' })
    return
  }
  let deviceId: string | undefined
  let friendlyName: string | undefined
  if (
    typeof body.deviceId === 'string' &&
    /^[A-Za-z0-9_.=-]{1,128}$/.test(body.deviceId)
  ) {
    deviceId = body.deviceId
  }
  if (typeof body.friendlyName === 'string') {
    friendlyName = body.friendlyName.slice(0, 100)
  }
  if (!deviceId) {
    writeJson(res, 400, { error: 'deviceId is required' })
    return
  }
  const userAgent = req.headers['user-agent']?.slice(0, 200)

  if (!(await ctx.matrix.userExists(mxid))) {
    await ctx.matrix.createUser(mxid)
  }

  // Idempotent: re-attesting the same device reuses the row instead of
  // piling up session records.
  const existing = (await ctx.db.listDeviceSessions(auth.did)).find(
    (s) => s.mxid === mxid && s.deviceId === deviceId && s.revokedAt == null,
  )
  const now = new Date().toISOString()
  const id = existing?.id ?? randomUUID()
  if (!existing) {
    await ctx.db.createDeviceSession({
      id,
      did: auth.did,
      mxid,
      deviceId,
      friendlyName: friendlyName ?? null,
      userAgent: userAgent ?? null,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    })
  } else {
    await ctx.db.touchDeviceSession(id)
  }
  await reconcileAccess(ctx, auth.did, mxid)

  writeJson(res, 200, {
    userId: mxid,
    sessionId: id,
    deviceId,
    attested: true,
  })
}

/**
 * POST /api/community-join — the verified join (OD-6 / CD-M6).
 *
 * Body: { communityUri, assertion }. The caller must hold (1) a live M8
 * session, (2) active membership of the community in governance state, and
 * (3) the identity private key behind the MXID it wants to join as. All three
 * are checked here; only then does the projection force-join the derived
 * MXID into the community's rooms with the right power levels. Nothing about
 * the DID↔MXID pairing is persisted — the join decision is made and consumed
 * in this request.
 */
export async function apiCommunityJoinHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const { signed, body } = await readAssertionBody(req)
  const challenge = signed.assertion.challenge
  if (
    typeof challenge !== 'string' ||
    !ctx.challenges.consume(challenge, auth.did)
  ) {
    writeJson(res, 401, { error: 'Unknown, expired or reused challenge' })
    return
  }
  const communityUri: string | undefined = body.communityUri
  if (!communityUri) {
    writeJson(res, 400, { error: 'communityUri is required' })
    return
  }

  const space = await ctx.db.getSpaceForCommunity(communityUri)
  if (!space) {
    writeJson(res, 404, { error: 'Space not found for community' })
    return
  }
  const membership = await ctx.db.getCommunityMembership(auth.did, communityUri)
  if (!membership || membership.state !== 'active') {
    writeJson(res, 403, { error: 'Not an active community member' })
    return
  }

  const mxid = mxidFromVerifiedAssertion(
    signed,
    { purpose: 'matrix-login', audience: BRIDGE_AUDIENCES.join, challenge },
    ctx.config.matrixServerName,
  )
  if (!mxid) {
    writeJson(res, 401, { error: 'Invalid identity proof' })
    return
  }

  const roles = membership.roles ?? []
  const isObserver = roles.includes('observer')
  const chamber =
    space.chamberMode === 'bicameral' && !isObserver
      ? await ctx.firehose.decideChamber(communityUri, auth.did)
      : null

  const identityPubHex = signed.assertion.identityPub
  const identityPub = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    identityPub[i] = Number.parseInt(identityPubHex.slice(i * 2, i * 2 + 2), 16)
  }

  const { mxid: joinedMxid, joinedRoomIds } = await ctx.projection.verifiedJoin(
    space,
    auth.did,
    identityPub,
    { roles, chamber, isObserver },
  )
  // The join settled this community; reconciliation settles the member's
  // others (role catch-up, removal bans) in the same verified interaction.
  await reconcileAccess(ctx, auth.did, joinedMxid)
  writeJson(res, 200, {
    userId: joinedMxid,
    spaceId: space.spaceId,
    joinedRoomIds,
    chamber,
  })
}

/** POST /api/push-token */
export async function apiPushTokenHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const raw = await readBody(req)
  let parsed: any = {}
  try {
    parsed = JSON.parse(raw || '{}')
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
  const { expoPushToken, platform } = parsed
  const did = auth.did
  if (!expoPushToken) {
    writeJson(res, 400, { error: 'Missing expoPushToken' })
    return
  }

  // Expo delivery is keyed by DID and is the load-bearing path.
  await ctx.db.setPushToken(did, expoPushToken, platform || 'unknown')

  // Synapse-side pusher registration needs the caller's MXID. Post-CD-M1
  // there is no mapping to read: the client states it by presenting the same
  // identity proof as everywhere else (audience: identity). Without a valid
  // assertion the Expo token is still saved and only native Matrix push is
  // skipped — the client can also set its own pusher with the session token
  // it holds, which is the cleaner long-term home for this.
  const signed = parsed?.assertion
  const challenge = signed?.assertion?.challenge
  const mxid =
    signed && typeof challenge === 'string'
      ? mxidFromVerifiedAssertion(
          signed,
          {
            purpose: 'matrix-login',
            audience: BRIDGE_AUDIENCES.identity,
            challenge,
          },
          ctx.config.matrixServerName,
        )
      : null
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
export async function apiMarkReadHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
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
  const room = await resolveRoom(ctx, roomId)
  if (ctx.events) {
    // The caller's other devices clear their badge for this room.
    await ctx.events.publish({
      type: 'chat.unread',
      communityUri: room?.communityUri ?? null,
      audienceDids: [did],
      payload: { roomId, clearedFor: did, upTo: targetEventId },
    })
  }
  writeJson(res, 200, { ok: true })
}

/** GET /api/unread (prefix) */
export async function apiUnreadHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const did = auth.did
  const communities = await ctx.db.getUnreadCountsForDid(did)
  const total = communities.reduce((sum, c) => sum + c.unread, 0)
  writeJson(res, 200, { unread: total, communities })
}

/** GET /api/rooms */
export async function apiRoomsHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
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
