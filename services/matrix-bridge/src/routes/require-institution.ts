import { HttpError } from '../m8-auth.js'
import {
  authorize,
  type InstitutionCapability,
  type InstitutionMembership,
} from '../institutions.js'
import type { IBridgeDatabase } from '../db/index.js'

export interface InstitutionAccess {
  institutionId: string
  /** Omitted for institution-scoped capabilities such as `audit.read`. */
  workspaceId?: string
  capability: InstitutionCapability
}

/**
 * Load the caller's memberships and enforce one capability. Prefers the
 * workspace-bound row for workspace-scoped capabilities, then falls back to
 * the institution-wide row. Throws HttpError(403) naming the denial — the
 * server's central handler renders it — so routes stay one call.
 */
export async function requireInstitutionCapability(
  db: Pick<IBridgeDatabase, 'getInstitutionMemberships'>,
  session: { did: string },
  access: InstitutionAccess,
): Promise<InstitutionMembership> {
  const memberships = await db.getInstitutionMemberships(
    access.institutionId,
    session.did,
  )
  const workspaceId = access.workspaceId ?? null
  const candidate =
    memberships.find((m) => m.workspaceId === workspaceId) ??
    memberships.find((m) => m.workspaceId === null) ??
    null
  const decision = authorize({
    membership: candidate,
    institutionId: access.institutionId,
    workspaceId: access.workspaceId,
    capability: access.capability,
  })
  if (!decision.allowed) {
    throw new HttpError(403, `institution access denied: ${decision.denial}`)
  }
  return candidate as InstitutionMembership
}
