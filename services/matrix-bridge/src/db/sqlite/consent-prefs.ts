import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { ParticipationArea } from './participation.js'

export class ConsentPrefsArea extends ParticipationArea {


  // User chat preferences
  getChatPreferences(did: string): { showChatBadges: boolean } {
    const row = this.db
      .prepare(
        'SELECT show_chat_badges FROM user_chat_preferences WHERE did = ?',
      )
      .get(did) as { show_chat_badges: number } | undefined
    return { showChatBadges: row ? row.show_chat_badges === 1 : false }
  }


  setChatPreferences(did: string, showChatBadges: boolean): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO user_chat_preferences (did, show_chat_badges, updated_at) VALUES (?, ?, datetime('now'))",
      )
      .run(did, showChatBadges ? 1 : 0)
  }


  // Third-party LLM processing consent (OD-3)
  getAiConsent(did: string): AiConsentRecord {
    const row = this.db
      .prepare(
        'SELECT granted, policy_version, granted_at, revoked_at FROM ai_processing_consent WHERE did = ?',
      )
      .get(did) as
      | {
          granted: number
          policy_version: number
          granted_at: string | null
          revoked_at: string | null
        }
      | undefined
    // No row means never asked, which is not consent.
    if (!row) {
      return {
        did,
        granted: false,
        policyVersion: 0,
        grantedAt: null,
        revokedAt: null,
      }
    }
    return {
      did,
      granted: row.granted === 1,
      policyVersion: row.policy_version,
      grantedAt: row.granted_at,
      revokedAt: row.revoked_at,
    }
  }


  setAiConsent(did: string, granted: boolean, policyVersion: number): void {
    const existing = this.getAiConsent(did)
    const now = new Date().toISOString()
    const grantedAt = granted ? (existing.grantedAt ?? now) : existing.grantedAt
    const revokedAt = granted ? null : now
    this.db
      .prepare(
        `INSERT OR REPLACE INTO ai_processing_consent
           (did, granted, policy_version, granted_at, revoked_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(did, granted ? 1 : 0, policyVersion, grantedAt, revokedAt)
  }


  getConsentingDids(dids: string[], policyVersion: number): Set<string> {
    if (dids.length === 0) return new Set()
    const unique = [...new Set(dids)]
    const placeholders = unique.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT did FROM ai_processing_consent
         WHERE did IN (${placeholders}) AND granted = 1 AND policy_version >= ?`,
      )
      .all(...unique, policyVersion) as Array<{ did: string }>
    return new Set(rows.map((r) => r.did))
  }
}
