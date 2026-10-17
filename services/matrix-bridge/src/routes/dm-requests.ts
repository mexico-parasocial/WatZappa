import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  BRIDGE_AUDIENCES,
  mxidFromVerifiedAssertion,
} from '../identity-proof.js'
import { HttpError, authenticateM8 } from '../m8-auth.js'
import type { RouteContext } from './context.js'
import { readBody, writeJson } from './http.js'

/**
 * Matrix direct messages by consent.
 *
 * The homeserver cannot name the Matrix account behind a DID (CD-M1/CD-M6),
 * so nobody can open a DM with a DID directly. Instead:
 *
 *   1. A asks for a DM with B's DID, proving with iM8 (audience dm.v1) which
 *      MXID is theirs. That proof is A's consent to share the MXID with B.
 *   2. B lists its incoming requests: requester DIDs only, never MXIDs.
 *   3. B accepts: B alone receives A's MXID, once, and the request stays as
 *      'accepted' with the MXID blanked, so A knows an invite is coming. B's
 *      own client creates the encrypted direct room, invites A and sends an
 *      encrypted com.para.dm.intro { requestId, did } that A checks against
 *      its accepted request. Or B declines (or A cancels or dismisses), and
 *      it is removed with nothing returned.
 *
 * A request lives only while pending (DM_REQUEST_TTL_MS at most). It is the
 * one place the bridge holds a DID next to an MXID, by the requester's
 * explicit, revocable consent; it never appears in any other response.
 */

export const DM_REQUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000
/** Live requests one DID may have outstanding; more is a 429. */
export const DM_REQUEST_MAX_PENDING = 20

const DID_RE = /^did:[a-z]+:[A-Za-z0-9._:%-]{1,2048}$/

async function readJson(req: IncomingMessage): Promise<any> {
  try {
    return JSON.parse((await readBody(req)) || '{}')
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

function requestId(body: any): string {
  if (typeof body?.id !== 'string' || body.id.length > 64) {
    throw new HttpError(400, 'id is required')
  }
  return body.id
}

/** POST /api/dm-requests — { recipientDid, assertion } */
export async function apiDmRequestCreateHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const body = await readJson(req)
  const recipientDid = body.recipientDid
  if (typeof recipientDid !== 'string' || !DID_RE.test(recipientDid)) {
    writeJson(res, 400, { error: 'recipientDid must be a DID' })
    return
  }
  if (recipientDid === auth.did) {
    writeJson(res, 400, { error: 'Cannot request a DM with yourself' })
    return
  }
  // Like the other proof-bearing endpoints, accept the SignedAssertion at the
  // top level (PARA's bridgeCallWithProof) or nested under `assertion`.
  const signed =
    typeof body.signature === 'string' && typeof body.assertion === 'object'
      ? { assertion: body.assertion, signature: body.signature }
      : body.assertion
  const challenge = signed?.assertion?.challenge
  if (
    typeof challenge !== 'string' ||
    !ctx.challenges.consume(challenge, auth.did)
  ) {
    writeJson(res, 401, { error: 'Unknown, expired or reused challenge' })
    return
  }
  const mxid = mxidFromVerifiedAssertion(
    signed,
    { purpose: 'matrix-login', audience: BRIDGE_AUDIENCES.dm, challenge },
    ctx.config.matrixServerName,
  )
  if (!mxid) {
    writeJson(res, 401, { error: 'Invalid identity proof' })
    return
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const pending = await ctx.db.countPendingDmRequestsFrom(auth.did, nowIso)
  if (pending >= DM_REQUEST_MAX_PENDING) {
    writeJson(res, 429, {
      error: 'TOO_MANY_PENDING_DM_REQUESTS',
      limit: DM_REQUEST_MAX_PENDING,
    })
    return
  }

  // The recipient's client invites this account on acceptance; it has to
  // exist on the homeserver by then. Best-effort, like matrix-identity.
  try {
    if (!(await ctx.matrix.userExists(mxid))) {
      await ctx.matrix.createUser(mxid)
    }
  } catch (err: any) {
    ctx.log.warn({ err }, 'Could not ensure Matrix account for DM requester')
  }

  const result = await ctx.db.upsertDmRequest(
    {
      id: randomUUID(),
      requesterDid: auth.did,
      requesterMxid: mxid,
      recipientDid,
      createdAt: nowIso,
      expiresAt: new Date(now.getTime() + DM_REQUEST_TTL_MS).toISOString(),
    },
    nowIso,
  )

  // CD-M6: a verified interaction ends with access reconciliation.
  try {
    await ctx.projection.reconcileMemberAccess(auth.did, mxid)
  } catch (err: any) {
    ctx.log.warn({ err }, 'Access reconciliation failed; retried later')
  }

  writeJson(res, result.created ? 201 : 200, {
    id: result.id,
    expiresAt: result.expiresAt,
  })
}

/** GET /api/dm-requests — { incoming, outgoing }, never MXIDs. */
export async function apiDmRequestListHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const now = new Date().toISOString()
  await ctx.db.purgeExpiredDmRequests(now)
  const { incoming, outgoing } = await ctx.db.listDmRequests(auth.did, now)
  writeJson(res, 200, {
    incoming: incoming.map((r) => ({
      id: r.id,
      requesterDid: r.requesterDid,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    })),
    outgoing: outgoing.map((r) => ({
      id: r.id,
      recipientDid: r.recipientDid,
      status: r.status,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    })),
  })
}

/**
 * POST /api/dm-requests/accept — { id }. Only the recipient. Returns the
 * requester's MXID once and marks the request accepted (MXID blanked); the
 * caller's client then creates the encrypted direct room and invites it.
 */
export async function apiDmRequestAcceptHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const id = requestId(await readJson(req))
  const taken = await ctx.db.takeDmRequest(
    id,
    auth.did,
    new Date().toISOString(),
  )
  if (!taken) {
    writeJson(res, 404, { error: 'No such pending request for you' })
    return
  }
  writeJson(res, 200, {
    requesterDid: taken.requesterDid,
    requesterMxid: taken.requesterMxid,
  })
}

/** POST /api/dm-requests/decline — { id }. Recipient declines, requester cancels or dismisses an accepted one. */
export async function apiDmRequestDeclineHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const id = requestId(await readJson(req))
  if (!(await ctx.db.deleteDmRequest(id, auth.did))) {
    writeJson(res, 404, { error: 'No such pending request for you' })
    return
  }
  writeJson(res, 200, { removed: true })
}
