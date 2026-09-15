import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_ASSERTION_MAX_AGE } from '../oauth-constants.js'
import { ReplayManager } from './replay-manager.js'

describe('ReplayManager.uniqueSpaceToken', () => {
  const unique =
    vi.fn<
      (namespace: string, nonce: string, timeFrame: number) => Promise<boolean>
    >()
  const manager = new ReplayManager({ unique })

  beforeEach(() => {
    unique.mockReset().mockResolvedValue(true)
    vi.spyOn(Date, 'now').mockReturnValue(10_000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses a namespace scoped to the token kind and issuer', async () => {
    await expect(
      manager.uniqueSpaceToken(
        'delegation',
        'did:plc:authority',
        'token-id',
        70,
      ),
    ).resolves.toBe(true)

    expect(unique).toHaveBeenCalledWith(
      'Space:delegation@did:plc:authority',
      'token-id',
      60_000,
    )
  })

  it('uses the client-assertion window when the token has no expiry', async () => {
    await manager.uniqueSpaceToken(
      'attestation',
      'https://client.example',
      'id',
    )

    expect(unique).toHaveBeenCalledWith(
      'Space:attestation@https://client.example',
      'id',
      Math.ceil(CLIENT_ASSERTION_MAX_AGE * 1.1),
    )
  })
})
