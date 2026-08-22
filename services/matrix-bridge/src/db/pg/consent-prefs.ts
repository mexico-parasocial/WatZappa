import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { ParticipationArea } from './participation.js'

export class ConsentPrefsArea extends ParticipationArea {


  // User chat preferences
  async getChatPreferences(did: string): Promise<{ showChatBadges: boolean }> {
    const row = await this.queryOne<{ show_chat_badges: number }>(
      'SELECT show_chat_badges FROM user_chat_preferences WHERE did = $1',
      [did],
    )
    return { showChatBadges: row ? row.show_chat_badges === 1 : false }
  }


  async setChatPreferences(
    did: string,
    showChatBadges: boolean,
  ): Promise<void> {
    await this.run(
      `INSERT INTO user_chat_preferences (did, show_chat_badges, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (did) DO UPDATE SET show_chat_badges = EXCLUDED.show_chat_badges, updated_at = NOW()`,
      [did, showChatBadges ? 1 : 0],
    )
  }


  // Third-party LLM processing consent (OD-3)
  async getAiConsent(did: string): Promise<AiConsentRecord> {
    const row = await this.queryOne<{
      granted: number
      policy_version: number
      granted_at: string | null
      revoked_at: string | null
    }>(
      'SELECT granted, policy_version, granted_at, revoked_at FROM ai_processing_consent WHERE did = $1',
      [did],
    )
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


  async setAiConsent(
    did: string,
    granted: boolean,
    policyVersion: number,
  ): Promise<void> {
    await this.run(
      `INSERT INTO ai_processing_consent
         (did, granted, policy_version, granted_at, revoked_at, updated_at)
       VALUES ($1, $2, $3, CASE WHEN $2 = 1 THEN NOW() ELSE NULL END,
                           CASE WHEN $2 = 0 THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (did) DO UPDATE SET
         granted = EXCLUDED.granted,
         policy_version = EXCLUDED.policy_version,
         granted_at = CASE WHEN EXCLUDED.granted = 1
           THEN COALESCE(ai_processing_consent.granted_at, NOW()) ELSE ai_processing_consent.granted_at END,
         revoked_at = CASE WHEN EXCLUDED.granted = 0 THEN NOW() ELSE NULL END,
         updated_at = NOW()`,
      [did, granted ? 1 : 0, policyVersion],
    )
  }


  async getConsentingDids(
    dids: string[],
    policyVersion: number,
  ): Promise<Set<string>> {
    if (dids.length === 0) return new Set()
    const unique = [...new Set(dids)]
    const placeholders = unique.map((_, i) => `$${i + 1}`).join(',')
    const rows = await this.queryAll<{ did: string }>(
      `SELECT did FROM ai_processing_consent
       WHERE did IN (${placeholders}) AND granted = 1 AND policy_version >= $${unique.length + 1}`,
      [...unique, policyVersion],
    )
    return new Set(rows.map((r) => r.did))
  }
}
