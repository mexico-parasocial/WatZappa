export interface ChatPreferencesStore {
  getChatPreferences(did: string): Promise<{ showChatBadges: boolean }>

  setChatPreferences(did: string, showChatBadges: boolean): Promise<void>
}
