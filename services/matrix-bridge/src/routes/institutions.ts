import type { IncomingMessage, ServerResponse } from 'node:http'
import { authenticateM8, HttpError } from '../m8-auth.js'
import {
  canAssignRole,
  isInstitutionRole,
  isMembershipActive,
} from '../institutions.js'
import type { RouteContext } from './context.js'
import { readBody, writeJson } from './http.js'
import { requireInstitutionCapability } from './require-institution.js'

function asOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new HttpError(400, 'workspaceId must be a string when present')
  }
  return value
}

function asOptionalIsoDate(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, 'expiresAt must be an ISO datetime when present')
  }
  return value
}

/** POST /api/institution/members — grant or replace one membership. */
export async function apiInstitutionMembersPOSTHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const body = JSON.parse(await readBody(req))
  const { institutionId, did, role } = body
  if (typeof institutionId !== 'string' || institutionId.length === 0) {
    throw new HttpError(400, 'institutionId must be a non-empty string')
  }
  if (typeof did !== 'string' || did.length === 0) {
    throw new HttpError(400, 'did must be a non-empty string')
  }
  if (typeof role !== 'string' || !isInstitutionRole(role)) {
    throw new HttpError(400, 'role must be a known institution role')
  }
  const workspaceId = asOptionalString(body.workspaceId)
  const expiresAt = asOptionalIsoDate(body.expiresAt)

  // Bootstrap: the first membership of an institution must be a
  // self-registered owner. Anything else needs an entitled grantor.
  const owners = await ctx.db.getInstitutionOwners(institutionId)
  if (owners.size === 0) {
    if (role !== 'owner' || did !== auth.did || workspaceId !== null) {
      throw new HttpError(
        403,
        'first membership of an institution must be a self-registered owner',
      )
    }
    await ctx.db.setInstitutionMembership({
      institutionId,
      workspaceId: null,
      did,
      role: 'owner',
      expiresAt,
    })
    ctx.log.info({ institutionId, did }, 'Institution bootstrapped')
    writeJson(res, 200, { ok: true, bootstrapped: true })
    return
  }

  const grantor = await requireInstitutionCapability(ctx.db, auth, {
    institutionId,
    workspaceId: workspaceId ?? undefined,
    capability: 'member.invite',
  })
  if (
    !canAssignRole({
      institutionId,
      grantor,
      targetRole: role,
      targetWorkspaceId: workspaceId,
    })
  ) {
    throw new HttpError(403, 'role cannot assign the requested role')
  }
  await ctx.db.setInstitutionMembership({
    institutionId,
    workspaceId,
    did,
    role,
    expiresAt,
  })
  ctx.log.info(
    { institutionId, workspaceId, did, role, grantor: auth.did },
    'Institution membership granted',
  )
  writeJson(res, 200, { ok: true })
}

/** POST /api/institution/members/revoke — revoke one membership. */
export async function apiInstitutionMembersRevokeHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const body = JSON.parse(await readBody(req))
  const { institutionId, did } = body
  if (typeof institutionId !== 'string' || institutionId.length === 0) {
    throw new HttpError(400, 'institutionId must be a non-empty string')
  }
  if (typeof did !== 'string' || did.length === 0) {
    throw new HttpError(400, 'did must be a non-empty string')
  }
  const workspaceId = asOptionalString(body.workspaceId)

  await requireInstitutionCapability(ctx.db, auth, {
    institutionId,
    workspaceId: workspaceId ?? undefined,
    capability: 'member.remove',
  })

  const target = (
    await ctx.db.getInstitutionMemberships(institutionId, did)
  ).find((m) => m.workspaceId === workspaceId)
  if (!target) {
    throw new HttpError(404, 'membership not found')
  }

  // The last active owner is irremovable: ownership must be handed over
  // first, never destroyed by revocation.
  const now = new Date()
  if (target.role === 'owner' && isMembershipActive(target, now)) {
    const owners = await ctx.db.getInstitutionOwners(institutionId)
    const activeOwners = [...owners.values()].filter((m) =>
      isMembershipActive(m, now),
    )
    if (
      activeOwners.length === 1 &&
      activeOwners[0]?.did === target.did
    ) {
      throw new HttpError(
        409,
        'cannot revoke the last active owner; transfer ownership first',
      )
    }
  }

  await ctx.db.revokeInstitutionMembership(institutionId, workspaceId, did)
  ctx.log.info(
    { institutionId, workspaceId, did, revokedBy: auth.did },
    'Institution membership revoked',
  )
  writeJson(res, 200, { ok: true })
}

/** GET /api/institution/members — roster for an institution or workspace. */
export async function apiInstitutionMembersGETHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const institutionId = url.searchParams.get('institutionId')
  if (!institutionId) {
    throw new HttpError(400, 'Missing institutionId parameter')
  }
  const workspaceId = url.searchParams.get('workspaceId') ?? undefined

  await requireInstitutionCapability(ctx.db, auth, {
    institutionId,
    workspaceId,
    capability: 'message.read',
  })

  const members = await ctx.db.listInstitutionMemberships(
    institutionId,
    workspaceId,
  )
  writeJson(res, 200, {
    members: members.map((m) => ({
      did: m.did,
      role: m.role,
      workspaceId: m.workspaceId,
      expiresAt: m.expiresAt,
      revokedAt: m.revokedAt,
    })),
  })
}
