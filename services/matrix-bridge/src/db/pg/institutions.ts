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
      expiresAt: toIso(row.expires_at),
      revokedAt: toIso(row.revoked_at),
    }
  }

  async setInstitutionMembership(m: {
    institutionId: string
    workspaceId: string | null
    did: string
    role: InstitutionRole
    expiresAt: string | null
  }): Promise<void> {
    await this.run(
      `INSERT INTO institution_memberships
         (institution_id, workspace_id, did, role, expires_at, revoked_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NULL, NOW())
       ON CONFLICT (institution_id, workspace_id, did) DO UPDATE SET
         role = EXCLUDED.role,
         expires_at = EXCLUDED.expires_at,
         revoked_at = NULL,
         updated_at = NOW()`,
      [
        m.institutionId,
        m.workspaceId ?? INSTITUTION_WIDE,
        m.did,
        m.role,
        m.expiresAt,
      ],
    )
  }

  async revokeInstitutionMembership(
    institutionId: string,
    workspaceId: string | null,
    did: string,
  ): Promise<void> {
    await this.run(
      `UPDATE institution_memberships
       SET revoked_at = $1, updated_at = NOW()
       WHERE institution_id = $2 AND workspace_id = $3 AND did = $4
         AND revoked_at IS NULL`,
      [
        new Date().toISOString(),
        institutionId,
        workspaceId ?? INSTITUTION_WIDE,
        did,
      ],
    )
  }

  async getInstitutionMemberships(
    institutionId: string,
    did: string,
  ): Promise<InstitutionMembership[]> {
    const rows = await this.queryAll(
      'SELECT * FROM institution_memberships WHERE institution_id = $1 AND did = $2',
      [institutionId, did],
    )
    return rows.map((row) => this.mapInstitutionMembership(row))
  }

  async listInstitutionMemberships(
    institutionId: string,
    workspaceId?: string,
  ): Promise<InstitutionMembership[]> {
    const rows =
      workspaceId === undefined
        ? await this.queryAll(
            'SELECT * FROM institution_memberships WHERE institution_id = $1 ORDER BY did, workspace_id',
            [institutionId],
          )
        : await this.queryAll(
            'SELECT * FROM institution_memberships WHERE institution_id = $1 AND workspace_id = $2 ORDER BY did',
            [institutionId, workspaceId],
          )
    return rows.map((row) => this.mapInstitutionMembership(row))
  }

  async getInstitutionOwners(
    institutionId: string,
  ): Promise<Map<string, InstitutionMembership>> {
    const rows = await this.queryAll(
      "SELECT * FROM institution_memberships WHERE institution_id = $1 AND role = 'owner'",
      [institutionId],
    )
    return new Map(
      rows.map((row) => {
        const membership = this.mapInstitutionMembership(row)
        return [membership.did, membership] as const
      }),
    )
  }
}

/** TIMESTAMPTZ columns arrive as Dates; the domain type carries ISO strings. */
function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}
