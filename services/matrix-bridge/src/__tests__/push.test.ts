import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendExpoNotifications } from '../push.js'

afterEach(() => vi.unstubAllGlobals())
const notification = {
  tokens: ['ExpoPushToken[one]', 'ExponentPushToken[two]'],
  title: 'Chat',
  body: 'New message',
  data: { eventId: '$event' },
}
describe('Expo push tickets', () => {
  it('returns permanently invalid keys and accepts the other ticket', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { status: 'error', details: { error: 'DeviceNotRegistered' } },
              { status: 'ok', id: 'ticket' },
            ],
          }),
        ),
      ),
    )
    expect(await sendExpoNotifications(notification)).toEqual([
      'ExpoPushToken[one]',
    ])
  })
  it('fails temporary errors so the gateway can request a homeserver retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { status: 'error', details: { error: 'MessageRateExceeded' } },
              { status: 'ok' },
            ],
          }),
        ),
      ),
    )
    await expect(sendExpoNotifications(notification)).rejects.toThrow(
      'Expo push ticket rejected',
    )
  })
  it('bounds decoded provider responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(' '.repeat(65_537))),
    )
    await expect(sendExpoNotifications(notification)).rejects.toThrow(
      'HTTP response too large',
    )
  })
})
