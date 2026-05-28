import { describe, expect, it, vi } from 'vitest'
import { authenticateM8, getBearerToken, HttpError } from '../m8-auth.js'

function req(authorization?: string): any {
  return { headers: { authorization } }
}

describe('M8 bridge auth', () => {
  it('rejects requests without a bearer token', () => {
    expect(() => getBearerToken(req())).toThrow(HttpError)
    try {
      getBearerToken(req())
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError)
      expect((err as HttpError).statusCode).toBe(401)
    }
  })

  it('derives the DID from /sessions/me', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { did: 'did:plc:alice', sessionId: 'session-1' },
      }),
    } as Response)

    const session = await authenticateM8(req('Bearer token-1'), {
      m8BaseUrl: 'http://m8.test/v1/',
    } as any)

    expect(session.did).toBe('did:plc:alice')
    expect(fetchMock).toHaveBeenCalledWith('http://m8.test/v1/sessions/me', {
      headers: { Authorization: 'Bearer token-1' },
    })

    fetchMock.mockRestore()
  })
})
