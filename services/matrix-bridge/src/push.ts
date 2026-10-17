/** Expo push delivery. Used by the Matrix push gateway route and by the
 * sortition engine when it notifies selected members. */
import { readBoundedJson } from './http-response.js'

export type ExpoPushTicket = {
  status: string
  id?: string
  details?: { error?: string }
}

export async function sendExpoNotifications({
  tokens,
  title,
  body,
  data,
  badge,
  onTicket,
}: {
  tokens: string[]
  title?: string
  body?: string
  data: Record<string, unknown>
  badge?: number
  onTicket?: (token: string, ticket: ExpoPushTicket) => Promise<void>
}) {
  const rejected: string[] = []
  if (tokens.length === 0) return rejected
  const messages = tokens.map((token) => ({
    to: token,
    sound: body ? 'default' : undefined,
    title,
    body,
    data,
    badge,
  }))
  // Expo accepts max 100 messages per request
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100)
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      throw new Error(`Expo push failed: ${res.status}`)
    }
    const result = await readBoundedJson<{
      data?: ExpoPushTicket[]
    }>(res, 65_536)
    if (!Array.isArray(result.data) || result.data.length !== chunk.length)
      throw new Error('Expo push ticket rejected')
    let failed = false
    for (let index = 0; index < result.data.length; index++) {
      const ticket = result.data[index]
      if (ticket.status === 'ok') {
        if (onTicket && (!ticket.id || typeof ticket.id !== 'string'))
          failed = true
        else await onTicket?.(chunk[index].to, ticket)
        continue
      }
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      ) {
        rejected.push(chunk[index].to)
        await onTicket?.(chunk[index].to, ticket)
      } else failed = true
    }
    if (failed) throw new Error('Expo push ticket rejected')
  }
  return rejected
}
