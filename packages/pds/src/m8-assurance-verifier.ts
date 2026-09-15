import type { Redis } from 'ioredis'
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from 'jose'
import { z } from 'zod'
import { HOUR } from '@atproto/common'
import { jwksPubSchema } from '@atproto/jwk'
import { SpaceRef, isValidDid } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import {
  type Fetch,
  bindFetch,
  fetchResponseMaxSizeChecker,
} from '@atproto-labs/fetch'
import { CachedGetter, type GetterOptions } from '@atproto-labs/simple-store'
import { SimpleStoreMemory } from '@atproto-labs/simple-store-memory'
import { SimpleStoreRedis } from '@atproto-labs/simple-store-redis'
import {
  M8_ASSURANCE_CLOCK_TOLERANCE_SEC as CLOCK_TOLERANCE_SEC,
  M8_ASSURANCE_MAX_LIFETIME_SEC as MAX_ASSERTION_LIFETIME_SEC,
} from './m8-assurance-constants.js'

const JWKS_CACHE_TTL = 1 * HOUR
const FORCED_JWKS_REFRESH_COOLDOWN_MS = 60_000

export const M8_ASSURANCE_TYP = 'application/para-m8-assurance+jwt'
export const M8_ASSURANCE_LEVEL_V1 = 'm8-session-verified'

type Jwks = ReturnType<typeof jwksPubSchema.parse>

const boundedString = (max: number) => z.string().min(1).max(max)

const assuranceClaimsSchema = z.object({
  iss: boundedString(2_048),
  sub: boundedString(2_048),
  aud: boundedString(2_048),
  client_id: boundedString(2_048),
  cnf: z.object({ jkt: boundedString(256) }).strict(),
  space: boundedString(2_048),
  nonce: boundedString(256),
  jti: boundedString(256),
  iat: z.number().int().nonnegative().safe(),
  exp: z.number().int().nonnegative().safe(),
  assurance: z
    .object({
      version: z.literal(1),
      level: z.literal(M8_ASSURANCE_LEVEL_V1),
    })
    .strict(),
})

type M8AssuranceClaims = z.infer<typeof assuranceClaimsSchema>

/**
 * Values the assertion must bind to the particular PDS credential exchange.
 * The caller derives these only from already verified OAuth/DPoP state and the
 * canonical immutable space URI; they are never taken from an M8 assertion.
 */
export type M8AssuranceBindings = {
  did: string
  clientId: string
  dpopJkt: string
  space: string
  audience: string
  nonce: string
}

/**
 * The durable consumer atomically marks a PDS-issued challenge and the
 * M8 assertion identifier spent. It must reject unless its stored challenge
 * has the exact same bindings and has not expired or been used already.
 */
export interface M8AssuranceConsumer {
  consume(input: {
    issuer: string
    jti: string
    expiresAt: number
    bindings: M8AssuranceBindings
  }): Promise<boolean>
}

export type M8AssuranceVerifierConfig = {
  issuer: string
  jwksUrl: string
}

export type M8AssuranceVerifierOptions = {
  now?: () => Date
  redis?: Redis
}

export type VerifiedM8Assurance = {
  issuer: string
  jti: string
  issuedAt: number
  expiresAt: number
  assurance: M8AssuranceClaims['assurance']
}

/**
 * Verifies the draft v1 M8 assurance assertion. This class is intentionally
 * standalone: AppContext does not construct it and no XRPC route invokes it
 * until the PARA exchange is feature-gated and backed by a durable consumer.
 */
export class M8AssuranceVerifier {
  private readonly jwks: CachedGetter<string, Jwks>
  private readonly now: () => Date
  private readonly config: M8AssuranceVerifierConfig
  private forcedRefreshPromise: Promise<Jwks> | undefined
  private nextForcedRefreshAt = 0

  constructor(
    safeFetch: Fetch,
    config: M8AssuranceVerifierConfig,
    private readonly consumer: M8AssuranceConsumer,
    options: M8AssuranceVerifierOptions = {},
  ) {
    this.config = validateConfig(config)
    const fetch = bindFetch(safeFetch)
    this.now = options.now ?? (() => new Date())
    this.jwks = new CachedGetter<string, Jwks>(
      async (url, getterOptions) => {
        const json = await fetchJson(fetch, url, getterOptions)
        const jwks = jwksPubSchema.parse(json)
        return {
          keys: jwks.keys.filter(
            (key) => key.kty === 'OKP' && key.crv === 'Ed25519',
          ),
        }
      },
      options.redis
        ? new SimpleStoreRedis(options.redis, {
            ttl: JWKS_CACHE_TTL,
            keyPrefix: 'm8-assurance-jwks:',
          })
        : new SimpleStoreMemory({ max: 10, ttl: JWKS_CACHE_TTL }),
    )
  }

  async verify(
    assertion: string,
    input: M8AssuranceBindings,
  ): Promise<VerifiedM8Assurance> {
    const bindings = { ...input }
    assertBindingInput(bindings)
    if (typeof assertion !== 'string' || assertion.length > 16_384) {
      throw new InvalidRequestError(
        'Invalid M8 assurance assertion',
        'InvalidM8Assurance',
      )
    }
    const header = parseHeader(assertion)
    const keys = await this.resolveKeys(header.kid)
    const { payload, protectedHeader } = await jwtVerify(
      assertion,
      createLocalJWKSet(keys),
      {
        algorithms: ['EdDSA'],
        issuer: this.config.issuer,
        subject: bindings.did,
        audience: bindings.audience,
        typ: M8_ASSURANCE_TYP,
        requiredClaims: ['iss', 'sub', 'aud', 'iat', 'exp', 'jti'],
        currentDate: this.now(),
        clockTolerance: CLOCK_TOLERANCE_SEC,
      },
    ).catch(invalid('Invalid M8 assurance assertion'))

    // jose normalizes away an `application/` prefix when applying its `typ`
    // option. Retain an exact, signed comparison for this PARA-specific type.
    if (protectedHeader.typ !== M8_ASSURANCE_TYP) {
      throw new InvalidRequestError(
        'Invalid M8 assurance assertion header',
        'InvalidM8Assurance',
      )
    }

    const claims = assuranceClaimsSchema.safeParse(payload)
    if (!claims.success) {
      throw new InvalidRequestError(
        'Invalid M8 assurance assertion claims',
        'InvalidM8Assurance',
        { cause: claims.error },
      )
    }

    assertFresh(claims.data, this.now())
    assertBindings(claims.data, bindings, this.config.issuer)

    // This is deliberately last: a malformed or mismatched assertion must not
    // consume a usable PDS challenge or M8 JTI.
    const consumed = await this.consumer.consume({
      issuer: this.config.issuer,
      jti: claims.data.jti,
      expiresAt: claims.data.exp,
      bindings,
    })
    if (!consumed) {
      throw new InvalidRequestError(
        'M8 assurance assertion or challenge is invalid or already used',
        'InvalidM8Assurance',
      )
    }

    return {
      issuer: this.config.issuer,
      jti: claims.data.jti,
      issuedAt: claims.data.iat,
      expiresAt: claims.data.exp,
      assurance: claims.data.assurance,
    }
  }

  private async resolveKeys(kid: string): Promise<Jwks> {
    const cached = await this.jwks
      .get(this.config.jwksUrl)
      .catch(invalid('Could not resolve configured M8 assurance JWKS'))
    if (hasKid(cached, kid)) return cached

    // Retry once only when the protected-header kid is absent from the cached
    // set. A cooldown and single-flight refresh keep attacker-chosen unknown
    // kids from becoming an unbounded configured-JWKS fetch amplification.
    const refreshed = await this.refreshJwks()
    if (!hasKid(refreshed, kid)) {
      throw new InvalidRequestError(
        'M8 assurance assertion uses an unknown signing key',
        'InvalidM8Assurance',
      )
    }
    return refreshed
  }

  private async refreshJwks(): Promise<Jwks> {
    if (this.forcedRefreshPromise) return this.forcedRefreshPromise

    const now = this.now().getTime()
    if (now < this.nextForcedRefreshAt) {
      throw new InvalidRequestError(
        'M8 assurance assertion uses an unknown signing key',
        'InvalidM8Assurance',
      )
    }
    this.nextForcedRefreshAt = now + FORCED_JWKS_REFRESH_COOLDOWN_MS
    const refresh = this.jwks
      .get(this.config.jwksUrl, { noCache: true })
      .catch(invalid('Could not refresh configured M8 assurance JWKS'))
    this.forcedRefreshPromise = refresh
    try {
      return await refresh
    } finally {
      if (this.forcedRefreshPromise === refresh) {
        this.forcedRefreshPromise = undefined
      }
    }
  }
}

const validateConfig = (
  config: M8AssuranceVerifierConfig,
): M8AssuranceVerifierConfig => {
  if (typeof config?.issuer !== 'string' || !config.issuer.trim()) {
    throw new Error('M8 assurance issuer is required')
  }
  let jwksUrl: URL
  try {
    jwksUrl = new URL(config.jwksUrl)
  } catch {
    throw new Error('M8 assurance JWKS URL is invalid')
  }
  if (
    jwksUrl.protocol !== 'https:' ||
    jwksUrl.username ||
    jwksUrl.password ||
    jwksUrl.hash
  ) {
    throw new Error(
      'M8 assurance JWKS URL must use HTTPS without credentials or fragment',
    )
  }
  return { issuer: config.issuer, jwksUrl: jwksUrl.href }
}

const parseHeader = (assertion: string): { kid: string } => {
  let header: ReturnType<typeof decodeProtectedHeader>
  try {
    header = decodeProtectedHeader(assertion)
  } catch (cause) {
    throw new InvalidRequestError(
      'Invalid M8 assurance assertion header',
      'InvalidM8Assurance',
      { cause },
    )
  }

  if (
    header.typ !== M8_ASSURANCE_TYP ||
    header.alg !== 'EdDSA' ||
    typeof header.kid !== 'string' ||
    !header.kid
  ) {
    throw new InvalidRequestError(
      'Invalid M8 assurance assertion header',
      'InvalidM8Assurance',
    )
  }
  return { kid: header.kid }
}

const hasKid = (jwks: Jwks, kid: string): boolean =>
  jwks.keys.some((key) => key.kid === kid)

const assertFresh = (claims: M8AssuranceClaims, now: Date): void => {
  if (
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > MAX_ASSERTION_LIFETIME_SEC
  ) {
    throw new InvalidRequestError(
      'M8 assurance assertion has an invalid lifetime',
      'InvalidM8Assurance',
    )
  }
  const nowSec = Math.floor(now.getTime() / 1_000)
  if (
    !Number.isFinite(nowSec) ||
    claims.iat > nowSec + CLOCK_TOLERANCE_SEC ||
    claims.exp <= nowSec - CLOCK_TOLERANCE_SEC
  ) {
    throw new InvalidRequestError(
      'M8 assurance assertion is outside its validity window',
      'InvalidM8Assurance',
    )
  }
}

const assertBindings = (
  claims: M8AssuranceClaims,
  bindings: M8AssuranceBindings,
  issuer: string,
): void => {
  if (
    claims.iss !== issuer ||
    claims.sub !== bindings.did ||
    claims.aud !== bindings.audience ||
    claims.client_id !== bindings.clientId ||
    claims.cnf.jkt !== bindings.dpopJkt ||
    claims.space !== bindings.space ||
    claims.nonce !== bindings.nonce
  ) {
    throw new InvalidRequestError(
      'M8 assurance assertion does not match this credential exchange',
      'InvalidM8Assurance',
    )
  }
}

const assertBindingInput = (bindings: M8AssuranceBindings): void => {
  const strings = [
    ['did', bindings.did, 2_048],
    ['client ID', bindings.clientId, 2_048],
    ['DPoP JKT', bindings.dpopJkt, 256],
    ['space', bindings.space, 2_048],
    ['audience', bindings.audience, 2_048],
    ['nonce', bindings.nonce, 256],
  ] as const
  if (
    strings.some(
      ([, value, max]) =>
        typeof value !== 'string' || !value.trim() || value.length > max,
    )
  ) {
    throw new InvalidRequestError(
      'Invalid M8 assurance exchange bindings',
      'InvalidM8Assurance',
    )
  }
  if (!isValidDid(bindings.did)) {
    throw new InvalidRequestError(
      'Invalid M8 assurance exchange bindings',
      'InvalidM8Assurance',
    )
  }
  try {
    if (SpaceRef.parse(bindings.space).toString() !== bindings.space) {
      throw new Error('Non-canonical space URI')
    }
  } catch {
    throw new InvalidRequestError(
      'Invalid M8 assurance exchange bindings',
      'InvalidM8Assurance',
    )
  }
}

const invalid =
  (message: string) =>
  (cause: unknown): never => {
    throw new InvalidRequestError(message, 'InvalidM8Assurance', { cause })
  }

async function fetchJson(
  fetch: (req: Request) => Promise<Response>,
  url: string,
  options?: GetterOptions,
): Promise<unknown> {
  const res = await fetch(
    new Request(url, {
      headers: {
        accept: 'application/json',
        ...(options?.noCache ? { 'cache-control': 'no-cache' } : undefined),
      },
      signal: options?.signal,
      redirect: 'error',
    }),
  )
  if (!res.ok) {
    throw new Error(`Unexpected status ${res.status} fetching "${url}"`)
  }
  return fetchResponseMaxSizeChecker(res, 65_536).json()
}
