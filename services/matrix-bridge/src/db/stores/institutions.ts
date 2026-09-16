import type {
  InstitutionMembership,
  InstitutionRole,
} from '../../institutions.js'

export interface InstitutionMembershipInput {
  institutionId: string
  workspaceId: string | null
  did: string
  role: InstitutionRole
  expiresAt: string | null
}

export interface InstitutionStore {
  /**
   * Grant or replace one membership. Re-granting clears a prior revocation;
   * removal goes through `revokeInstitutionMembership` so the audit trail
   * keeps the distinction between a role change and a removal.
   */
  setInstitutionMembership(m: InstitutionMembershipInput): Promise<void>

  /** Stamp `revoked_at`. Idempotent; a no-op when no membership exists. */
  revokeInstitutionMembership(
    institutionId: string,
    workspaceId: string | null,
    did: string,
  ): Promise<void>

  /** Every membership row one DID holds in an institution, all workspaces. */
  getInstitutionMemberships(
    institutionId: string,
    did: string,
  ): Promise<InstitutionMembership[]>

  /** Roster for an institution, optionally narrowed to one workspace. */
  listInstitutionMemberships(
    institutionId: string,
    workspaceId?: string,
  ): Promise<InstitutionMembership[]>

  /**
   * All owner rows, keyed by DID. Includes revoked and expired rows — callers
   * apply `isMembershipActive` — so handover validation sees the full roll.
   */
  getInstitutionOwners(
    institutionId: string,
  ): Promise<Map<string, InstitutionMembership>>
}
