import type {
  InstitutionMembership,
  InstitutionRole,
} from '../../institutions.js'
import { DeliberationArea } from './deliberation.js'

/** Institution-wide rows carry '' in workspace_id; the mapper restores null. */
const INSTITUTION_WIDE = ''

export class InstitutionsArea extends DeliberationArea {
  protected mapInstitutionMembership(row: any): InstitutionMembership {
    return {
      institutionId: row.institution_id,
      workspaceId:
        row.workspace_id === INSTITUTION_WIDE ? null : row.workspace_id,
      did: row.did,
      role: row.role as InstitutionRole,
      expiresAt: row.expires_at ?? null,
      revokedAt: row.revoked_at ?? null,
    }
  }

  setInstitutionMembership(m: {
    institutionId: string
    workspaceId: string | null
    did: string
    role: InstitutionRole
    expiresAt: string | null
  }): void {
    this.db
      .prepare(
        `INSERT INTO institution_memberships
           (institution_id, workspace_id, did, role, expires_at, revoked_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, datetime('now'))
         ON CONFLICT (institution_id, workspace_id, did) DO UPDATE SET
           role = excluded.role,
           expires_at = excluded.expires_at,
           revoked_at = NULL,
           updated_at = datetime('now')`,
      )
      .run(
        m.institutionId,
        m.workspaceId ?? INSTITUTION_WIDE,
        m.did,
        m.role,
        m.expiresAt,
      )
  }

  revokeInstitutionMembership(
    institutionId: string,
    workspaceId: string | null,
    did: string,
  ): void {
    this.db
      .prepare(
        `UPDATE institution_memberships
         SET revoked_at = ?, updated_at = datetime('now')
         WHERE institution_id = ? AND workspace_id = ? AND did = ?
           AND revoked_at IS NULL`,
      )
      .run(
        new Date().toISOString(),
        institutionId,
        workspaceId ?? INSTITUTION_WIDE,
        did,
      )
  }

  getInstitutionMemberships(
    institutionId: string,
    did: string,
  ): InstitutionMembership[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM institution_memberships WHERE institution_id = ? AND did = ?',
      )
      .all(institutionId, did) as any[]
    return rows.map((row) => this.mapInstitutionMembership(row))
  }

  listInstitutionMemberships(
    institutionId: string,
    workspaceId?: string,
  ): InstitutionMembership[] {
    const rows =
      workspaceId === undefined
        ? (this.db
            .prepare(
              'SELECT * FROM institution_memberships WHERE institution_id = ? ORDER BY did, workspace_id',
            )
            .all(institutionId) as any[])
        : (this.db
            .prepare(
              'SELECT * FROM institution_memberships WHERE institution_id = ? AND workspace_id = ? ORDER BY did',
            )
            .all(institutionId, workspaceId) as any[])
    return rows.map((row) => this.mapInstitutionMembership(row))
  }

  getInstitutionOwners(
    institutionId: string,
  ): Map<string, InstitutionMembership> {
    const rows = this.db
      .prepare(
        "SELECT * FROM institution_memberships WHERE institution_id = ? AND role = 'owner'",
      )
      .all(institutionId) as any[]
    return new Map(
      rows.map((row) => {
        const membership = this.mapInstitutionMembership(row)
        return [membership.did, membership] as const
      }),
    )
  }
}
