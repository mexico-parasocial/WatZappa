import { JoseKey } from '@atproto/oauth-provider/provider'
import { ClientAttestationVerifier } from '../src/client-attestation-verifier.js'

const memoryReplayManager = () => {
  const seen = new Set<string>()
  return {
    uniqueSpaceToken: async (kind: string, issuer: string, jti: string) => {
      const key = `${kind}:${issuer}:${jti}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    },
  }
}

const CLIENT_ID = 'https://app.example.com/client-metadata.json'
const JWKS_URI = 'https://app.example.com/jwks.json'
const SPACE_HOST = 'did:plc:authority#atproto_space_host'

describe('client attestation verification', () => {
  let clientKey: JoseKey
  let otherKey: JoseKey

  beforeAll(async () => {
    clientKey = await JoseKey.generate(['ES256'], 'key-1')
    otherKey = await JoseKey.generate(['ES256'], 'key-1')
  })

  const metadata = (extra?: Record<string, unknown>) => ({
    client_id: CLIENT_ID,
    client_name: 'Example App',
    redirect_uris: ['https://app.example.com/cb'],
    response_types: ['code'],
    grant_types: ['authorization_code'],
    scope: 'atproto',
    application_type: 'web',
    token_endpoint_auth_method: 'private_key_jwt',
    dpop_bound_access_tokens: true,
    ...extra,
  })

  const verifierFor = (
    routes: Record<string, unknown>,
  ): ClientAttestationVerifier => {
    const fetch = async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url
      const body = routes[url]
      if (!body) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new ClientAttestationVerifier(fetch as never, memoryReplayManager())
  }

  let nonce = 0
  const attestation = async (
    key: JoseKey,
    opts?: {
      iss?: string
      sub?: string
      aud?: string
      expiresInSec?: number
      jti?: string | null
    },
  ) => {
    const now = Math.floor(Date.now() / 1000)
    return key.createJwt(
      { alg: 'ES256', typ: 'atproto-client-attestation+jwt' },
      {
        iss: opts?.iss ?? CLIENT_ID,
        sub: opts?.sub ?? CLIENT_ID,
        aud: opts?.aud ?? SPACE_HOST,
        iat: now,
        exp: now + (opts?.expiresInSec ?? 60),
        ...(opts?.jti === null
          ? undefined
          : { jti: opts?.jti ?? `nonce-${++nonce}` }),
      },
    )
  }

  it('accepts an attestation signed by a key in client metadata', async () => {
    const verifier = verifierFor({
      [CLIENT_ID]: metadata({ jwks: { keys: [clientKey.publicJwk] } }),
    })
    await expect(
      verifier.verify(await attestation(clientKey), SPACE_HOST),
    ).resolves.toBe(CLIENT_ID)
  })

  it('accepts an attestation when the client publishes a jwks_uri', async () => {
    const verifier = verifierFor({
      [CLIENT_ID]: metadata({ jwks_uri: JWKS_URI }),
      [JWKS_URI]: { keys: [clientKey.publicJwk] },
    })
    await expect(
      verifier.verify(await attestation(clientKey), SPACE_HOST),
    ).resolves.toBe(CLIENT_ID)
  })

  it('rejects a replay but accepts a distinct signed token', async () => {
    const verifier = verifierFor({
      [CLIENT_ID]: metadata({ jwks: { keys: [clientKey.publicJwk] } }),
    })
    const replayed = await attestation(clientKey)

    await expect(verifier.verify(replayed, SPACE_HOST)).resolves.toBe(CLIENT_ID)
    await expect(verifier.verify(replayed, SPACE_HOST)).rejects.toThrow(
      /already been used/,
    )
    await expect(
      verifier.verify(await attestation(clientKey), SPACE_HOST),
    ).resolves.toBe(CLIENT_ID)
  })

  it('rejects an unsigned claim of a client identity', async () => {
    const verifier = verifierFor({
      [CLIENT_ID]: metadata({ jwks: { keys: [clientKey.publicJwk] } }),
    })
    await expect(
      verifier.verify(await attestation(otherKey), SPACE_HOST),
    ).rejects.toThrow(/Invalid client attestation/)
  })

  it('rejects a token addressed to another authority', async () => {
    const verifier = verifierFor({
      [CLIENT_ID]: metadata({ jwks: { keys: [clientKey.publicJwk] } }),
    })
    await expect(
      verifier.verify(
        await attestation(clientKey, {
          aud: 'did:plc:elsewhere#atproto_space_host',
        }),
        SPACE_HOST,
      ),
    ).rejects.toThrow(/Invalid client attestation/)
  })

  it('rejects missing jti, expiration, mismatched subject, and expired tokens', async () => {
    const verifier = verifierFor({
      [CLIENT_ID]: metadata({ jwks: { keys: [clientKey.publicJwk] } }),
    })

    await expect(
      verifier.verify(await attestation(clientKey, { jti: null }), SPACE_HOST),
    ).rejects.toThrow(/jti/)
    await expect(
      verifier.verify(
        await attestation(clientKey, { expiresInSec: -120 }),
        SPACE_HOST,
      ),
    ).rejects.toThrow(/Invalid client attestation/)
    await expect(
      verifier.verify(
        await attestation(clientKey, { sub: 'https://other.example/client' }),
        SPACE_HOST,
      ),
    ).rejects.toThrow(/iss.*sub/)
  })

  it('rejects unavailable metadata, unavailable JWKS, and metadata with no keys', async () => {
    const emptyVerifier = verifierFor({})
    await expect(
      emptyVerifier.verify(await attestation(clientKey), SPACE_HOST),
    ).rejects.toThrow(/Could not resolve client metadata/)

    const noKeysVerifier = verifierFor({ [CLIENT_ID]: metadata() })
    await expect(
      noKeysVerifier.verify(await attestation(clientKey), SPACE_HOST),
    ).rejects.toThrow(/publishes no keys/)

    const missingJwksVerifier = verifierFor({
      [CLIENT_ID]: metadata({ jwks_uri: JWKS_URI }),
    })
    await expect(
      missingJwksVerifier.verify(await attestation(clientKey), SPACE_HOST),
    ).rejects.toThrow(/Could not resolve client JWKS/)
  })
})
