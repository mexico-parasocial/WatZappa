import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { sign } from '@scure/sr25519'
import { sha512 } from '@noble/hashes/sha2'
import { numberToBytesLE, bytesToHex, hexToBytes } from '@noble/curves/abstract/utils'
import { Signer, type IdpConfig } from '../oidc.js'
import { LoginStore } from '../store.js'
import { createHandler } from '../server.js'
import { matrixLocalpart } from '../identity.js'

/*
 * End-to-end authorization-code flow, exercised through the HTTP handler with
 * fake request/response objects rather than a live socket.
 *
 * The client half signs with a real identity key from the shared vectors, so
 * this proves the whole chain: a PARA seed produces a signature that para-idp
 * verifies and turns into an ID token whose subject is the CD-M1 localpart.
 */

const here = dirname(fileURLToPath(import.meta.url))
const derivation = JSON.parse(
  readFileSync(join(here, 'identity-derivation-vectors.json'), 'utf8'),
).vectors[0] as { seed: string; identities: Array<{ label: string; priv: string; pub: string }> }

const ISSUER = 'https://idp.test'
const CLIENT: IdpConfig['clients'][number] = {
  clientId: 'mas',
  clientSecret: 'a'.repeat(48),
  redirectUris: ['https://mas.test/callback'],
}
const CONFIG: IdpConfig = { issuer: ISSUER, clients: [CLIENT], appScheme: 'para' }

// ── client-side signing, mirroring iM8 ──────────────────────────────────────
const CURVE_ORDER = 2n ** 252n + 27742317777372353535851937790883648493n
const identity = derivation.identities.find((i) => i.label === 'public')!
const scalar = BigInt('0x' + bytesToHex(hexToBytes(identity.priv).slice().reverse()))

function secretKey(): Uint8Array {
  const shifted = numberToBytesLE((scalar << 3n) & (2n ** 256n - 1n), 32)
  const nonceInput = new Uint8Array('para-id/sig-nonce/v1'.length + 32)
  nonceInput.set(new TextEncoder().encode('para-id/sig-nonce/v1'), 0)
  nonceInput.set(numberToBytesLE(scalar, 32), 'para-id/sig-nonce/v1'.length)
  const secret = new Uint8Array(64)
  secret.set(shifted, 0)
  secret.set(sha512(nonceInput).subarray(0, 32), 32)
  return secret
}

function signAssertion(challenge: string) {
  const assertion = {
    type: 'para.identity.pop.v1' as const,
    purpose: 'matrix-login' as const,
    audience: 'para-idp',
    identityPub: identity.pub,
    challenge,
    signedAt: new Date().toISOString(),
  }
  const encoded = new TextEncoder().encode(
    [
      'para-id/sig/v1',
      assertion.type,
      assertion.purpose,
      assertion.audience,
      assertion.identityPub,
      assertion.challenge,
      assertion.signedAt,
    ].join('\n'),
  )
  return { assertion, signature: bytesToHex(sign(secretKey(), encoded)) }
}

// ── minimal request/response doubles ────────────────────────────────────────
type Result = { status: number; body: any; headers: Record<string, string> }

function makeReq(method: string, url: string, body?: string) {
  const chunks = body ? [Buffer.from(body)] : []
  return Object.assign(
    (async function* () {
      for (const c of chunks) yield c
    })(),
    { method, url, headers: {} },
  ) as never
}

function makeRes(): { res: never; done: Promise<Result> } {
  let resolve!: (r: Result) => void
  const done = new Promise<Result>((r) => (resolve = r))
  const state: Result = { status: 0, body: undefined, headers: {} }
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      state.status = status
      Object.assign(state.headers, headers ?? {})
      return res
    },
    end(payload?: string) {
      try {
        state.body = payload ? JSON.parse(payload) : undefined
      } catch {
        state.body = payload
      }
      resolve(state)
    },
  }
  return { res: res as never, done }
}

let handler: ReturnType<typeof createHandler>
let signer: Signer

async function call(method: string, url: string, body?: string): Promise<Result> {
  const { res, done } = makeRes()
  await handler(makeReq(method, url, body), res)
  return done
}

beforeAll(async () => {
  signer = await Signer.load()
  handler = createHandler({ config: CONFIG, signer, store: new LoginStore() })
})

function pkce() {
  const verifier = randomBytes(48).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

function authorizeUrl(p: Record<string, string>): string {
  return `/authorize?${new URLSearchParams(p).toString()}`
}

function baseParams(codeChallenge: string) {
  return {
    client_id: 'mas',
    redirect_uri: 'https://mas.test/callback',
    response_type: 'code',
    scope: 'openid',
    state: 'st-123',
    nonce: 'nonce-abc',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }
}

describe('discovery', () => {
  it('advertises only what it implements', async () => {
    const r = await call('GET', '/.well-known/openid-configuration')
    expect(r.status).toBe(200)
    expect(r.body.issuer).toBe(ISSUER)
    expect(r.body.code_challenge_methods_supported).toEqual(['S256'])
    expect(r.body.grant_types_supported).toEqual(['authorization_code'])
  })

  it('publishes a JWKS with no private material', async () => {
    const r = await call('GET', '/jwks.json')
    expect(r.status).toBe(200)
    expect(r.body.keys).toHaveLength(1)
    expect(r.body.keys[0].d).toBeUndefined()
    expect(r.body.keys[0].kid).toBeTruthy()
  })
})

describe('full authorization-code flow', () => {
  it('turns a PARA seed into an ID token whose subject is the CD-M1 localpart', async () => {
    const { verifier, challenge: pkceChallenge } = pkce()

    const authorize = await call('GET', authorizeUrl(baseParams(pkceChallenge)))
    expect(authorize.status).toBe(200)
    expect(authorize.body.purpose).toBe('matrix-login')

    const signed = signAssertion(authorize.body.challenge)
    const verified = await call(
      'POST',
      '/authorize/verify',
      JSON.stringify({ challenge: authorize.body.challenge, ...signed }),
    )
    expect(verified.status).toBe(200)

    const redirect = new URL(verified.body.redirect_uri)
    expect(redirect.origin + redirect.pathname).toBe('https://mas.test/callback')
    expect(redirect.searchParams.get('state')).toBe('st-123')
    const code = redirect.searchParams.get('code')!

    const token = await call(
      'POST',
      '/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://mas.test/callback',
        client_id: 'mas',
        client_secret: CLIENT.clientSecret,
        code_verifier: verifier,
      }).toString(),
    )
    expect(token.status).toBe(200)
    expect(token.headers['Cache-Control']).toBe('no-store')

    const jwks = createLocalJWKSet(signer.jwks() as never)
    const { payload } = await jwtVerify(token.body.id_token, jwks, {
      issuer: ISSUER,
      audience: 'mas',
    })

    // The whole point: the subject is a hash of the identity public key.
    expect(payload.sub).toBe(matrixLocalpart(hexToBytes(identity.pub)))
    expect(payload.nonce).toBe('nonce-abc')
  })
})

describe('browser flow (how MAS actually arrives)', () => {
  it('serves a login page to a browser instead of raw JSON', async () => {
    const { challenge } = pkce()
    const { res, done } = makeRes()
    const req = makeReq('GET', authorizeUrl(baseParams(challenge)))
    ;(req as unknown as { headers: Record<string, string> }).headers = {
      accept: 'text/html,application/xhtml+xml',
    }
    await handler(req, res)
    const r = await done
    expect(r.status).toBe(200)
    expect(r.headers['Content-Type']).toMatch(/text\/html/)
    // A login page must not be framable, and must not pull in remote scripts.
    expect(r.headers['X-Frame-Options']).toBe('DENY')
    expect(r.headers['Content-Security-Policy']).toContain("default-src 'none'")
    expect(String(r.body)).toContain('para://idp-login?challenge=')
  })

  it('releases the waiting browser once the phone has signed', async () => {
    const { challenge } = pkce()
    const authorize = await call('GET', authorizeUrl(baseParams(challenge)))
    const sessionId = authorize.body.session_id as string
    expect(sessionId).toBeTruthy()

    // Nothing to report before the app signs.
    const before = await call('GET', `/authorize/status?session=${encodeURIComponent(sessionId)}`)
    expect(before.body).toEqual({ pending: true })

    const signed = signAssertion(authorize.body.challenge)
    await call(
      'POST',
      '/authorize/verify',
      JSON.stringify({ challenge: authorize.body.challenge, ...signed }),
    )

    const after = await call('GET', `/authorize/status?session=${encodeURIComponent(sessionId)}`)
    expect(after.body.redirect_uri).toContain('https://mas.test/callback?code=')

    // Single-use: a second poll must not replay the redirect.
    const again = await call('GET', `/authorize/status?session=${encodeURIComponent(sessionId)}`)
    expect(again.body).toEqual({ pending: true })
  })

  it('does not reveal whether a session exists', async () => {
    // "pending" for an unknown session too — otherwise the endpoint is an
    // oracle for guessing valid session ids.
    const r = await call('GET', '/authorize/status?session=not-a-real-session')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ pending: true })
  })
})

describe('security properties', () => {
  it('refuses an unregistered redirect_uri without redirecting to it', async () => {
    const { challenge } = pkce()
    const r = await call(
      'GET',
      authorizeUrl({ ...baseParams(challenge), redirect_uri: 'https://evil.test/steal' }),
    )
    // Must fail in place — redirecting would hand the code to the attacker.
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('invalid_request')
  })

  it('requires PKCE S256 and refuses plain', async () => {
    const { challenge } = pkce()
    const r = await call(
      'GET',
      authorizeUrl({ ...baseParams(challenge), code_challenge_method: 'plain' }),
    )
    expect(r.status).toBe(400)
  })

  it('consumes the challenge — a replayed assertion fails', async () => {
    const { challenge } = pkce()
    const authorize = await call('GET', authorizeUrl(baseParams(challenge)))
    const signed = signAssertion(authorize.body.challenge)
    const payload = JSON.stringify({ challenge: authorize.body.challenge, ...signed })

    expect((await call('POST', '/authorize/verify', payload)).status).toBe(200)
    const replay = await call('POST', '/authorize/verify', payload)
    expect(replay.status).toBe(400)
    expect(replay.body.error).toBe('invalid_grant')
  })

  it('consumes the authorization code — a second redemption fails', async () => {
    const { verifier, challenge: pkceChallenge } = pkce()
    const authorize = await call('GET', authorizeUrl(baseParams(pkceChallenge)))
    const signed = signAssertion(authorize.body.challenge)
    const verified = await call(
      'POST',
      '/authorize/verify',
      JSON.stringify({ challenge: authorize.body.challenge, ...signed }),
    )
    const code = new URL(verified.body.redirect_uri).searchParams.get('code')!
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://mas.test/callback',
      client_id: 'mas',
      client_secret: CLIENT.clientSecret,
      code_verifier: verifier,
    }).toString()

    expect((await call('POST', '/token', form)).status).toBe(200)
    const second = await call('POST', '/token', form)
    expect(second.status).toBe(400)
    expect(second.body.error).toBe('invalid_grant')
  })

  it('rejects a wrong PKCE verifier', async () => {
    const { challenge: pkceChallenge } = pkce()
    const authorize = await call('GET', authorizeUrl(baseParams(pkceChallenge)))
    const signed = signAssertion(authorize.body.challenge)
    const verified = await call(
      'POST',
      '/authorize/verify',
      JSON.stringify({ challenge: authorize.body.challenge, ...signed }),
    )
    const code = new URL(verified.body.redirect_uri).searchParams.get('code')!

    const r = await call(
      'POST',
      '/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://mas.test/callback',
        client_id: 'mas',
        client_secret: CLIENT.clientSecret,
        code_verifier: randomBytes(48).toString('base64url'),
      }).toString(),
    )
    expect(r.status).toBe(400)
    expect(r.body.error_description).toMatch(/PKCE/)
  })

  it('rejects a bad client secret', async () => {
    const r = await call(
      'POST',
      '/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'whatever',
        redirect_uri: 'https://mas.test/callback',
        client_id: 'mas',
        client_secret: 'b'.repeat(48),
        code_verifier: 'x'.repeat(48),
      }).toString(),
    )
    expect(r.status).toBe(401)
    expect(r.body.error).toBe('invalid_client')
  })

  it('rejects an assertion signed for the wrong audience', async () => {
    const { challenge } = pkce()
    const authorize = await call('GET', authorizeUrl(baseParams(challenge)))
    const signed = signAssertion(authorize.body.challenge)
    signed.assertion.audience = 'somewhere-else'
    const r = await call(
      'POST',
      '/authorize/verify',
      JSON.stringify({ challenge: authorize.body.challenge, ...signed }),
    )
    expect(r.status).toBe(401)
  })
})
