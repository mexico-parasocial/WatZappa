import {
  type JSONWebKeySet,
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
} from 'jose'
import { z } from 'zod'
import { AtUri, SpaceRef, isAtUriString, isValidDid } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { ActorDb } from '../db/index.js'
import { ParaPolicyReader } from './reader.js'
import {
  ParaPolicyChainError,
  ParaPolicyEpochError,
  ParaPolicyRebootstrapRequiredError,
  ParaPolicyTransactor,
  ParaPolicyVersionError,
  parseParaPolicyDelta,
} from './transactor.js'

export const PARA_POLICY_DELTA_TYP = 'application/para-policy-delta+jwt'
const MAX_SIGNED_DELTA_LENGTH = 16_384
const keySchema = z
  .object({
    kty: z.literal('OKP'),
    crv: z.literal('Ed25519'),
    x: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    kid: z.string().min(1).max(256),
    alg: z.literal('EdDSA').optional(),
    use: z.literal('sig').optional(),
    key_ops: z.array(z.literal('verify')).length(1).optional(),
  })
  .strict()
const headerSchema = z
  .object({
    alg: z.literal('EdDSA'),
    typ: z.literal(PARA_POLICY_DELTA_TYP),
    kid: z.string().min(1).max(256),
  })
  .strict()
const claimsSchema = z
  .object({
    iss: z.string(),
    aud: z.string(),
    iat: z.number().int().nonnegative().safe(),
    exp: z.number().int().positive().safe(),
    delta: z.record(z.unknown()),
  })
  .strict()

/** Draft control-plane trust: operator-pinned keys and an exact source per space. */
export type ParaPolicyIntakeConfig = {
  issuer: string
  audience: string
  space: string
  sourceUri: string
  jwks: JSONWebKeySet
  maxAssertionAgeSec: number
  /** Explicit permission for a fresh, signed full snapshot to initialize this space. */
  allowBootstrap: boolean
}

/** An exact accepted receipt, not a membership grant. Authenticate its transport. */
export type ParaPolicyAcceptedReceipt = {
  issuer: string
  audience: string
  space: string
  sourceUri: string
  sourceVersion: number
  projectionDigest: string
  projectionStatus: 'ready'
}

/**
 * Standalone signed intake. No endpoint constructs this class. Keys are pinned,
 * never fetched from token headers; rotations require updated trusted config.
 */
export class ParaPolicyIntake {
  private readonly config: Omit<ParaPolicyIntakeConfig, 'jwks'>
  private readonly resolveKey: ReturnType<typeof createLocalJWKSet>

  constructor(
    private readonly db: ActorDb,
    private readonly authorityDid: string,
    config: ParaPolicyIntakeConfig,
    private readonly now: () => Date = () => new Date(),
  ) {
    const { jwks, ...bindings } = config
    if (
      !isValidDid(config.issuer) ||
      !config.audience?.trim() ||
      !isAtUriString(config.sourceUri) ||
      !new AtUri(config.sourceUri).collection ||
      !new AtUri(config.sourceUri).rkey ||
      SpaceRef.parse(config.space).toString() !== config.space ||
      SpaceRef.parse(config.space).spaceDid !== authorityDid ||
      !Number.isSafeInteger(config.maxAssertionAgeSec) ||
      config.maxAssertionAgeSec <= 0 ||
      typeof config.allowBootstrap !== 'boolean'
    )
      throw new Error('Invalid PARA policy intake configuration')
    const keys = z.array(keySchema).min(1).max(16).parse(jwks.keys)
    if (new Set(keys.map((key) => key.kid)).size !== keys.length) {
      throw new Error('PARA policy signing key IDs must be unique')
    }
    this.config = { ...bindings }
    this.resolveKey = createLocalJWKSet({ keys })
  }

  /** Return a consistent receipt only for a live, non-stale configured projection. */
  async getAcceptedReceipt(): Promise<ParaPolicyAcceptedReceipt | null> {
    return this.db.transaction(async (tx) => {
      const space = await tx.db
        .selectFrom('space')
        .selectAll()
        .where('uri', '=', this.config.space)
        .executeTakeFirst()
      const state = await new ParaPolicyReader(tx).getPolicyState(
        this.config.space,
      )
      if (
        !space ||
        space.deletedAt !== null ||
        space.authority !== this.authorityDid ||
        !state ||
        state.projectionStatus !== 'ready' ||
        state.sourceIssuer !== this.config.issuer ||
        state.sourceUri !== this.config.sourceUri
      )
        return null
      return {
        issuer: this.config.issuer,
        audience: this.config.audience,
        space: this.config.space,
        sourceUri: this.config.sourceUri,
        sourceVersion: state.sourceVersion,
        projectionDigest: state.projectionDigest,
        projectionStatus: 'ready',
      }
    })
  }

  /** Verify before touching storage; commit a verified stream fault before rejecting it. */
  async ingest(assertion: string): Promise<void> {
    if (
      typeof assertion !== 'string' ||
      assertion.length > MAX_SIGNED_DELTA_LENGTH
    ) {
      throw invalidAssertion()
    }
    let payload: unknown
    try {
      headerSchema.parse(decodeProtectedHeader(assertion))
      const verified = await jwtVerify(assertion, this.resolveKey, {
        algorithms: ['EdDSA'],
        typ: PARA_POLICY_DELTA_TYP,
        issuer: this.config.issuer,
        audience: this.config.audience,
        requiredClaims: ['iss', 'aud', 'iat', 'exp'],
        currentDate: this.now(),
      })
      payload = verified.payload
    } catch {
      throw invalidAssertion()
    }
    const parsed = claimsSchema.safeParse(payload)
    if (!parsed.success) throw invalidAssertion()
    const claims = parsed.data
    // @NOTE never allow a nested payload to substitute its own signed receipt.
    if ('signedDelta' in claims.delta) throw invalidAssertion()
    const delta = parseParaPolicyDelta({
      ...claims.delta,
      signedDelta: assertion,
    })
    if (
      claims.iss !== this.config.issuer ||
      claims.aud !== this.config.audience ||
      delta.sourceIssuer !== this.config.issuer ||
      delta.space !== this.config.space ||
      delta.sourceUri !== this.config.sourceUri ||
      Date.parse(delta.issuedAt) !== claims.iat * 1_000
    )
      throw invalidAssertion()
    this.assertFresh(claims)

    const failure = await this.db.transaction(async (tx) => {
      this.assertFresh(claims)
      const previous = await new ParaPolicyReader(tx).getPolicyState(
        delta.space,
      )
      // @NOTE a stream fault is latched; ordinary snapshots cannot erase a known gap.
      if (previous?.projectionStatus === 'stale') {
        await new ParaPolicyTransactor(tx, this.authorityDid).recordPolicyFault(
          delta,
        )
        return new ParaPolicyRebootstrapRequiredError(delta.space)
      }
      if (!previous && !this.config.allowBootstrap) {
        throw new ParaPolicyRebootstrapRequiredError(delta.space)
      }
      try {
        await new ParaPolicyTransactor(tx, this.authorityDid).applyPolicyDelta(
          delta,
        )
      } catch (error) {
        const streamFault =
          previous?.projectionStatus === 'ready' &&
          delta.sourceVersion >= previous.sourceVersion &&
          (error instanceof ParaPolicyVersionError ||
            error instanceof ParaPolicyChainError ||
            error instanceof ParaPolicyEpochError)
        if (!streamFault) throw error
        await new ParaPolicyTransactor(tx, this.authorityDid).recordPolicyFault(
          delta,
        )
        // @NOTE returning the error commits invalidation; throwing here would roll it back.
        return error
      }
      return undefined
    })
    if (failure) throw failure
  }

  private assertFresh(claims: { iat: number; exp: number }): void {
    const now = Math.floor(this.now().getTime() / 1_000)
    if (
      !Number.isSafeInteger(now) ||
      claims.iat > now ||
      claims.exp <= now ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > this.config.maxAssertionAgeSec ||
      now - claims.iat >= this.config.maxAssertionAgeSec
    )
      throw invalidAssertion()
  }
}

function invalidAssertion(): InvalidRequestError {
  return new InvalidRequestError(
    'Invalid signed PARA policy delta',
    'InvalidPolicyAssertion',
  )
}
