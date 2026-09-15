import type { Fetch } from '@atproto-labs/fetch'
import {
  type M8AssuranceBindings,
  type M8AssuranceConsumer,
  M8AssuranceVerifier,
} from '../src/m8-assurance-verifier.js'
import {
  FIXTURE_NOW_SEC,
  M8_AUDIENCE,
  M8_CLIENT_ID,
  M8_DPOP_JKT,
  M8_ISSUER,
  M8_NONCE,
  M8_SPACE,
  PDS_DID,
  m8AssuranceVectors as vectors,
  primaryJwks,
  rotatedJwks,
} from './fixtures/m8-assurance-v1.js'

const jwksUrl = 'https://m8.para.example/assurance/jwks.json'
const bindings: M8AssuranceBindings = {
  did: PDS_DID,
  clientId: M8_CLIENT_ID,
  dpopJkt: M8_DPOP_JKT,
  space: M8_SPACE,
  audience: M8_AUDIENCE,
  nonce: M8_NONCE,
}

function fixture(
  options: {
    issuer?: string
    nowSec?: number
    response?: (request: Request, count: number) => Response
    consume?: M8AssuranceConsumer['consume']
  } = {},
) {
  const requests: Request[] = []
  const consumed: Parameters<M8AssuranceConsumer['consume']>[0][] = []
  const fetch: Fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input)
    requests.push(request)
    expect(request.url).toBe(jwksUrl)
    expect(request.redirect).toBe('error')
    return (
      options.response?.(request, requests.length) ?? Response.json(primaryJwks)
    )
  }
  const verifier = new M8AssuranceVerifier(
    fetch,
    {
      issuer: options.issuer ?? M8_ISSUER,
      jwksUrl,
    },
    {
      consume: async (input) => {
        consumed.push(input)
        return options.consume ? options.consume(input) : true
      },
    },
    {
      now: () => new Date((options.nowSec ?? FIXTURE_NOW_SEC) * 1_000),
    },
  )
  return { verifier, requests, consumed }
}

describe('M8 assurance verifier (draft v1)', () => {
  it('validates a fixed signed assertion and consumes its bound challenge last', async () => {
    const { verifier, requests, consumed } = fixture()
    await expect(
      verifier.verify(vectors.valid, bindings),
    ).resolves.toMatchObject({
      issuer: M8_ISSUER,
      jti: 'm8-jti-primary',
      issuedAt: FIXTURE_NOW_SEC,
      expiresAt: FIXTURE_NOW_SEC + 60,
      assurance: { version: 1, level: 'm8-session-verified' },
    })
    expect(requests).toHaveLength(1)
    expect(consumed).toEqual([
      {
        issuer: M8_ISSUER,
        jti: 'm8-jti-primary',
        expiresAt: FIXTURE_NOW_SEC + 60,
        bindings,
      },
    ])
  })

  it.each([
    'expired',
    'wrongTyp',
    'wrongAud',
    'missingNonce',
    'longLived',
    'unknownKid',
    'tampered',
  ] as const)(
    'rejects the %s vector without consuming a challenge',
    async (name) => {
      const { verifier, consumed } = fixture()
      await expect(
        verifier.verify(vectors[name], bindings),
      ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
      expect(consumed).toHaveLength(0)
    },
  )

  it.each([
    ['did', 'did:plc:7zp4oxrdragtjsm2j2vknwkz'],
    ['clientId', 'https://other.example/metadata.json'],
    ['dpopJkt', 'another-key'],
    ['space', `${M8_SPACE}-other`],
    ['audience', `${M8_AUDIENCE}-other`],
    ['nonce', `${M8_NONCE}-other`],
    ['did', ''],
    ['audience', ''],
  ])('rejects a mismatched or empty %s binding', async (key, value) => {
    const { verifier, consumed } = fixture()
    await expect(
      verifier.verify(vectors.valid, { ...bindings, [key]: value }),
    ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
    expect(consumed).toHaveLength(0)
  })

  it('rejects an untrusted issuer even when the configured key matches', async () => {
    const { verifier, consumed } = fixture({ issuer: 'did:web:other.example' })
    await expect(
      verifier.verify(vectors.valid, bindings),
    ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
    expect(consumed).toHaveLength(0)
  })

  it('rejects a future assertion', async () => {
    const { verifier, consumed } = fixture({ nowSec: FIXTURE_NOW_SEC - 10 })
    await expect(
      verifier.verify(vectors.valid, bindings),
    ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
    expect(consumed).toHaveLength(0)
  })

  it('refreshes the configured JWKS once for a rotated key', async () => {
    const { verifier, requests } = fixture({
      response: (_request, count) =>
        Response.json(count === 1 ? primaryJwks : rotatedJwks),
    })
    await expect(
      verifier.verify(vectors.rotated, bindings),
    ).resolves.toMatchObject({ jti: 'm8-jti-rotated' })
    expect(requests).toHaveLength(2)
    expect(requests[1].headers.get('cache-control')).toBe('no-cache')
  })

  it('limits refresh attempts for repeated unknown keys', async () => {
    const { verifier, requests, consumed } = fixture()
    for (let i = 0; i < 3; i++) {
      await expect(
        verifier.verify(vectors.unknownKid, bindings),
      ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
    }
    expect(requests).toHaveLength(2)
    expect(consumed).toHaveLength(0)
  })

  it('does not refresh known keys on a bad signature', async () => {
    const { verifier, requests, consumed } = fixture()
    await expect(
      verifier.verify(vectors.tampered, bindings),
    ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
    expect(requests).toHaveLength(1)
    expect(consumed).toHaveLength(0)
  })

  it('requires the consumer to accept a challenge and refuses replay', async () => {
    let spent = false
    const { verifier } = fixture({
      consume: async () => {
        if (spent) return false
        spent = true
        return true
      },
    })
    await verifier.verify(vectors.valid, bindings)
    await expect(
      verifier.verify(vectors.valid, bindings),
    ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
    const rejected = fixture({ consume: async () => false })
    await expect(
      rejected.verifier.verify(vectors.valid, bindings),
    ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
  })

  it.each([404, 503])('fails closed when JWKS returns %s', async (status) => {
    const { verifier, consumed } = fixture({
      response: () => new Response('', { status }),
    })
    await expect(
      verifier.verify(vectors.valid, bindings),
    ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
    expect(consumed).toHaveLength(0)
  })

  it('bounds decoded JWKS response bytes without relying on content-length', async () => {
    const { verifier, consumed } = fixture({
      response: () =>
        Response.json({ padding: 'x'.repeat(70_000), ...primaryJwks }),
    })
    await expect(
      verifier.verify(vectors.valid, bindings),
    ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
    expect(consumed).toHaveLength(0)
  })

  it('rejects empty trust configuration', () => {
    expect(() => fixture({ issuer: '' })).toThrow('issuer is required')
  })
})
