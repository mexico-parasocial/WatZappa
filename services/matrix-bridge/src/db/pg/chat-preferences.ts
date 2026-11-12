import { ModerationArea } from './moderation.js'

export class ChatPreferencesArea extends ModerationArea {
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
}
