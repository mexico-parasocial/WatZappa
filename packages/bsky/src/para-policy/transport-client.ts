import { randomBytes } from 'node:crypto'
import {
  type JSONWebKeySet,
  type KeyLike,
  SignJWT,
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
} from 'jose'
import { z } from 'zod'
import { isValidDid } from '@atproto/syntax'
import type { ParaPolicyRecoveryChallenge } from './publisher.js'

export const PARA_POLICY_TRANSPORT_REQUEST_TYP =
  'application/para-policy-transport-request+jwt'
export const PARA_POLICY_TRANSPORT_RESPONSE_TYP =
  'application/para-policy-transport-response+jwt'

const MAX_ENVELOPE_LIFETIME_SEC = 120

const responseHeaderSchema = z
  .object({
    alg: z.literal('EdDSA'),
    typ: z.literal(PARA_POLICY_TRANSPORT_RESPONSE_TYP),
    kid: z.string().min(1).max(256),
  })
  .strict()
const responseBodySchema = z.object({
  challenge: z
    .object({
      id: z.string(),
      secret: z.string(),
      issuer: z.string(),
      audience: z.string(),
      authority: z.string(),
      space: z.string(),
      sourceUri: z.string(),
      acceptedSourceVersion: z.number(),
      acceptedProjectionDigest: z.string(),
      maxSourceVersion: z.number(),
      maxPolicyEpoch: z.number(),
      issuedAt: z.string(),
      expiresAt: z.string(),
    })
    .nullable()
    .optional(),
  receipt: z
    .object({
      issuer: z.string(),
      audience: z.string(),
      space: z.string(),
      sourceUri: z.string(),
      sourceVersion: z.number(),
      projectionDigest: z.string(),
      projectionStatus: z.literal('ready'),
      policyEpoch: z.number().optional(),
      challengeId: z.string().optional(),
      installedAt: z.string().optional(),
    })
    .nullable()
    .optional(),
})
const responseClaimsSchema = z
  .object({
    iss: z.string(),
    aud: z.string(),
    iat: z.number().int().nonnegative().safe(),
    exp: z.number().int().positive().safe(),
    jti: z.string().min(1).max(256),
    req: z.string().min(1).max(256),
    body: responseBodySchema,
  })
  .strict()

export type ParaPolicyTransportReceipt = NonNullable<
  z.infer<typeof responseBodySchema>['receipt']
>

export class ParaPolicyTransportError extends Error {
  name = 'ParaPolicyTransportError'
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code)
  }
}

/** Trust for reaching one PDS's policy transport over authenticated HTTP. */
export type ParaPolicyTransportClientConfig = {
  /** Base URL of the PDS transport endpoint. */
  serviceUrl: string
  /** This publisher's issuer DID: signs requests, receives responses. */
  issuer: string
  /** The exact audience the PDS expects (its transport audience). */
  audience: string
  /** Signing key id for request envelopes. */
  kid: string
  /** The publisher's Ed25519 private key; also the pinned service identity. */
  privateKey: KeyLike
  /** The PDS's DID: must sign every response. */
  pdsDid: string
  /** Pinned PDS verification keys; rotations update this config. */
  jwks: JSONWebKeySet
  /** Envelope lifetime; must fit the server's bound. */
  maxAgeSec: number
}

/**
 * Authenticated HTTP client for one PDS's PARA policy transport. Every
 * request is single-use and signed by the pinned service identity; every
 * response must be signed by the pinned PDS key, addressed to this issuer,
 * and bound to the request identifier before any body is returned — the
 * caller never trusts an unauthenticated "ready".
 */
export class ParaPolicyTransportClient {
  private readonly verifyKey: ReturnType<typeof createLocalJWKSet>

  constructor(
    private readonly config: ParaPolicyTransportClientConfig,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (
      !this.config.serviceUrl?.startsWith('https://') &&
      !this.config.serviceUrl?.startsWith('http://localhost:') &&
      !this.config.serviceUrl?.startsWith('http://127.0.0.1:')
    ) {
      throw new Error(
        'PARA policy transport requires HTTPS (loopback excepted)',
      )
    }
    if (
      !isValidDid(this.config.issuer) ||
      !isValidDid(this.config.pdsDid) ||
      !this.config.audience?.trim() ||
      !this.config.kid?.trim() ||
      !Number.isSafeInteger(this.config.maxAgeSec) ||
      this.config.maxAgeSec <= 0 ||
      this.config.maxAgeSec > MAX_ENVELOPE_LIFETIME_SEC
    ) {
      throw new Error('Invalid PARA policy transport client configuration')
    }
    this.verifyKey = createLocalJWKSet({ keys: this.config.jwks.keys })
  }

  async issueChallenge(): Promise<ParaPolicyRecoveryChallenge | null> {
    const body = await this.request('issue-challenge')
    return body.challenge ?? null
  }

  async deliverDelta(
    assertion: string,
  ): Promise<ParaPolicyTransportReceipt | null> {
    const body = await this.request('deliver-delta', assertion)
    return body.receipt ?? null
  }

  async deliverCheckpoint(
    assertion: string,
  ): Promise<ParaPolicyTransportReceipt> {
    const body = await this.request('deliver-checkpoint', assertion)
    if (!body.receipt) {
      throw new ParaPolicyTransportError(500, 'MissingCheckpointReceipt')
    }
    return body.receipt
  }

  async checkpointReceipt(): Promise<ParaPolicyTransportReceipt | null> {
    const body = await this.request('checkpoint-receipt')
    return body.receipt ?? null
  }

  async acceptedReceipt(): Promise<ParaPolicyTransportReceipt | null> {
    const body = await this.request('accepted-receipt')
    return body.receipt ?? null
  }

  private async request(
    op: string,
    assertion?: string,
  ): Promise<z.infer<typeof responseBodySchema>> {
    const iat = Math.floor(this.now().getTime() / 1_000)
    const jti = randomBytes(16).toString('base64url')
    const claims: Record<string, unknown> = {
      iss: this.config.issuer,
      aud: this.config.audience,
      iat,
      exp: iat + this.config.maxAgeSec,
      jti,
      op,
    }
    if (assertion !== undefined) claims.assertion = assertion
    const token = await new SignJWT(claims)
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: PARA_POLICY_TRANSPORT_REQUEST_TYP,
        kid: this.config.kid,
      })
      .sign(this.config.privateKey)

    const res = await fetch(this.config.serviceUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/jwt' },
      body: token,
    })
    if (res.status !== 200) {
      const error = (await res.json().catch(() => null)) as {
        error?: string
      } | null
      throw new ParaPolicyTransportError(
        res.status,
        error?.error ?? `TransportFailure_${res.status}`,
      )
    }
    return this.verifyResponse(await res.text(), jti)
  }

  private async verifyResponse(
    token: string,
    requestJti: string,
  ): Promise<z.infer<typeof responseBodySchema>> {
    let payload: unknown
    try {
      responseHeaderSchema.parse(decodeProtectedHeader(token))
      payload = (
        await jwtVerify(token, this.verifyKey, {
          algorithms: ['EdDSA'],
          typ: PARA_POLICY_TRANSPORT_RESPONSE_TYP,
          issuer: this.config.pdsDid,
          audience: this.config.issuer,
          requiredClaims: ['iss', 'aud', 'iat', 'exp', 'jti', 'req', 'body'],
          currentDate: this.now(),
        })
      ).payload
    } catch {
      throw new ParaPolicyTransportError(498, 'InvalidResponseSignature')
    }
    const parsed = responseClaimsSchema.safeParse(payload)
    if (!parsed.success) {
      throw new ParaPolicyTransportError(498, 'InvalidResponseBody')
    }
    const current = Math.floor(this.now().getTime() / 1_000)
    if (
      !Number.isSafeInteger(current) ||
      parsed.data.exp <= current ||
      parsed.data.exp - parsed.data.iat > MAX_ENVELOPE_LIFETIME_SEC ||
      current - parsed.data.iat >= MAX_ENVELOPE_LIFETIME_SEC ||
      // @NOTE bind the response to the exact request it answers.
      parsed.data.req !== requestJti
    ) {
      throw new ParaPolicyTransportError(498, 'ResponseNotBound')
    }
    return parsed.data.body
  }
}
