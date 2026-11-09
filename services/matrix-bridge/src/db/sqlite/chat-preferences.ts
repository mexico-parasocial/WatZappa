import { ModerationArea } from './moderation.js'

export class ChatPreferencesArea extends ModerationArea {
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
}
