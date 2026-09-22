import { describe, expect, it, vi } from 'vitest'
import { verifyChatLink } from '../verify-chat-link.js'

describe('chat account ownership', () => {
  it('never authorizes from reciprocal public claims and makes no untrusted requests', async () => {
    const resolve = vi.fn()
    const fetchImpl = vi.fn()
    expect(
      await verifyChatLink({
        paraDid: 'did:plc:alice',
        linkedDid: 'did:plc:mallory',
        resolver: { resolve } as never,
        fetchImpl,
      }),
    ).toEqual({ ok: false, reason: 'matrix-proof-required' })
    expect(resolve).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
