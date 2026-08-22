/** Expo push delivery. Used by the Matrix push gateway route and by the
 * sortition engine when it notifies selected members. */

export async function sendExpoNotifications({
  tokens,
  title,
  body,
  data,
}: {
  tokens: string[]
  title: string
  body: string
  data: Record<string, unknown>
}) {
  if (tokens.length === 0) return
  const messages = tokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
  }))
  // Expo accepts max 100 messages per request
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Expo push failed: ${res.status} ${text}`)
    }
  }
}
