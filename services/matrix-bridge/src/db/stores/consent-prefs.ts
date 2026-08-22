import type {
  AiConsentRecord,
} from '../records.js'

export interface ConsentPrefsStore {

  getChatPreferences(did: string): Promise<{ showChatBadges: boolean }>

  setChatPreferences(did: string, showChatBadges: boolean): Promise<void>

  getAiConsent(did: string): Promise<AiConsentRecord>

  setAiConsent(
    did: string,
    granted: boolean,
    policyVersion: number,
  ): Promise<void>

  /**
   * Subset of `dids` that have live consent at `policyVersion`. Used to filter
   * text before it leaves for a third-party processor; returns an empty set for
   * an empty input rather than querying.
   */
  getConsentingDids(dids: string[], policyVersion: number): Promise<Set<string>>
}
