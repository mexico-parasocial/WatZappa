import { createHash, randomBytes } from 'node:crypto'
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
import { ParaPolicyTransactor, parseParaPolicyDelta } from './transactor.js'

export const PARA_POLICY_CHECKPOINT_TYP =
  'application/para-policy-checkpoint+jwt'
const MAX_SIGNED_CHECKPOINT_LENGTH = 16_384
/** Bounded decoded input: a larger recovery snapshot needs a reviewed transport, never a silent size increase. */
const MAX_CHALLENGE_LIFETIME_SEC = 3_600
const MAX_PENDING_CHALLENGES = 4
const CHALLENGE_ID_BYTES = 16
const CHALLENGE_SECRET_BYTES = 32
const CLEANUP_BATCH_SIZE = 500

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
    typ: z.literal(PARA_POLICY_CHECKPOINT_TYP),
    kid: z.string().min(1).max(256),
  })
  .strict()
const claimsSchema = z
  .object({
    iss: z.string(),
    aud: z.string(),
    iat: z.number().int().nonnegative().safe(),
    exp: z.number().int().positive().safe(),
    checkpoint: z.record(z.unknown()),
  })
  .strict()
const challengeSchema = z
  .object({
    id: z.string().min(1).max(256),
    secret: z.string().min(1).max(512),
  })
  .strict()

/** Draft recovery trust: the same pinned keys and exact bindings as the delta intake. */
export type ParaPolicyCheckpointConfig = {
  issuer: string
  audience: string
  space: string
  sourceUri: string
  jwks: JSONWebKeySet
  maxAssertionAgeSec: number
  challengeLifetimeSec: number
}

/**
 * A PDS-issued, single-use authorization to recover one stale projection. The
 * secret is proof material: relay it to the publisher only over authenticated
 * transport and only for the governance snapshot that answers this challenge.
 */
export type ParaPolicyCheckpointChallenge = {
  readonly id: string
  readonly secret: string
  readonly issuer: string
  readonly audience: string
  readonly authority: string
  readonly space: string
  readonly sourceUri: string
  readonly acceptedSourceVersion: number
  readonly acceptedProjectionDigest: string
  readonly maxSourceVersion: number
  readonly maxPolicyEpoch: number
  readonly issuedAt: string
  readonly expiresAt: string
}

/** An exact installed-checkpoint receipt, not a membership grant. */
export type ParaPolicyCheckpointReceipt = {
  issuer: string
  audience: string
  space: string
  sourceUri: string
  sourceVersion: number
  policyEpoch: number
  projectionDigest: string
  challengeId: string
  installedAt: string
  projectionStatus: 'ready'
}

/**
 * Standalone authenticated recovery for a stale or lagging PARA projection.
 * No endpoint constructs this class; the challenge secret and the receipt are
 * transport payloads whose callers must authenticate the other service.
 */
export class ParaPolicyCheckpoint {
  private readonly config: Omit<ParaPolicyCheckpointConfig, 'jwks'>
  private readonly resolveKey: ReturnType<typeof createLocalJWKSet>

  constructor(
    private readonly db: ActorDb,
    private readonly authorityDid: string,
    config: ParaPolicyCheckpointConfig,
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
      !Number.isSafeInteger(config.challengeLifetimeSec) ||
      config.challengeLifetimeSec <= 0 ||
      config.challengeLifetimeSec > MAX_CHALLENGE_LIFETIME_SEC
    )
      throw new Error('Invalid PARA policy checkpoint configuration')
    const keys = z.array(keySchema).min(1).max(16).parse(jwks.keys)
    if (new Set(keys.map((key) => key.kid)).size !== keys.length) {
      throw new Error('PARA policy signing key IDs must be unique')
    }
    this.config = { ...bindings }
    this.resolveKey = createLocalJWKSet({ keys })
  }

  /**
   * Issue a challenge only for a live, non-deleted space with an existing
   * projection for this exact source, whether it is latched stale (verified
   * fault) or merely ready-but-lagged behind an expired undelivered update.
   * Returns null when there is nothing to replace: absent state is bootstrap,
   * and a deleted space is not recoverable.
   */
  async issueChallenge(): Promise<ParaPolicyCheckpointChallenge | null> {
    return this.db.transaction(async (tx) => {
      const now = this.now()
      const space = await tx.db
        .selectFrom('space')
        .selectAll()
        .where('uri', '=', this.config.space)
        .executeTakeFirst()
      if (
        !space ||
        space.deletedAt !== null ||
        space.authority !== this.authorityDid
      )
        return null
      const reader = new ParaPolicyReader(tx)
      const state = await reader.getPolicyState(this.config.space)
      if (
        !state ||
        !['ready', 'stale'].includes(state.projectionStatus) ||
        state.sourceIssuer !== this.config.issuer ||
        state.sourceUri !== this.config.sourceUri
      )
        return null
      const fault = await reader.getPolicyFault(this.config.space)
      const maxSourceVersion = Math.max(
        state.sourceVersion,
        fault?.maxSourceVersion ?? 0,
      )
      const maxPolicyEpoch = Math.max(
        state.policyEpoch,
        fault?.maxPolicyEpoch ?? 0,
      )
      await this.deleteExpiredChallenges(tx, now.toISOString())
      const { count } = await tx.db
        .selectFrom('para_space_policy_challenge')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('space', '=', this.config.space)
        .where('consumedAt', 'is', null)
        .where('expiresAt', '>', now.toISOString())
        .executeTakeFirstOrThrow()
      if (count >= MAX_PENDING_CHALLENGES) {
        throw new InvalidRequestError(
          'Too many pending PARA policy recovery challenges',
          'TooManyPolicyChallenges',
        )
      }
      const challenge = {
        id: randomBytes(CHALLENGE_ID_BYTES).toString('base64url'),
        secret: randomBytes(CHALLENGE_SECRET_BYTES).toString('base64url'),
      }
      const record = {
        space: this.config.space,
        challengeId: challenge.id,
        secretHash: digest(challenge.secret),
        sourceIssuer: this.config.issuer,
        sourceUri: this.config.sourceUri,
        acceptedSourceVersion: state.sourceVersion,
        acceptedProjectionDigest: state.projectionDigest,
        maxSourceVersion,
        maxPolicyEpoch,
        issuedAt: now.toISOString(),
        expiresAt: new Date(
          now.getTime() + this.config.challengeLifetimeSec * 1_000,
        ).toISOString(),
        consumedAt: null,
      }
      await tx.db
        .insertInto('para_space_policy_challenge')
        .values(record)
        .execute()
      return Object.freeze({
        ...challenge,
        issuer: this.config.issuer,
        audience: this.config.audience,
        authority: this.authorityDid,
        space: this.config.space,
        sourceUri: this.config.sourceUri,
        acceptedSourceVersion: record.acceptedSourceVersion,
        acceptedProjectionDigest: record.acceptedProjectionDigest,
        maxSourceVersion,
        maxPolicyEpoch,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
      })
    })
  }

  /**
   * Verify a signed checkpoint and atomically consume its challenge and
   * install the full snapshot. Re-installing the same bytes is prohibited:
   * after a lost response, reconcile through getCheckpointReceipt instead.
   */
  async install(assertion: string): Promise<ParaPolicyCheckpointReceipt> {
    if (
      typeof assertion !== 'string' ||
      assertion.length > MAX_SIGNED_CHECKPOINT_LENGTH
    ) {
      throw invalidCheckpoint()
    }
    let payload: unknown
    try {
      headerSchema.parse(decodeProtectedHeader(assertion))
      const verified = await jwtVerify(assertion, this.resolveKey, {
        algorithms: ['EdDSA'],
        typ: PARA_POLICY_CHECKPOINT_TYP,
        issuer: this.config.issuer,
        audience: this.config.audience,
        requiredClaims: ['iss', 'aud', 'iat', 'exp'],
        currentDate: this.now(),
      })
      payload = verified.payload
    } catch {
      throw invalidCheckpoint()
    }
    const parsed = claimsSchema.safeParse(payload)
    if (!parsed.success) throw invalidCheckpoint()
    const claims = parsed.data
    // @NOTE never allow a nested payload to substitute its own signed receipt.
    if ('signedDelta' in claims.checkpoint) throw invalidCheckpoint()
    const challenge = challengeSchema.safeParse(claims.checkpoint.challenge)
    if (!challenge.success) throw invalidCheckpoint()
    const material: Record<string, unknown> = { ...claims.checkpoint }
    delete material.challenge
    const delta = parseParaPolicyDelta({ ...material, signedDelta: assertion })
    if (
      claims.iss !== this.config.issuer ||
      claims.aud !== this.config.audience ||
      delta.sourceIssuer !== this.config.issuer ||
      delta.space !== this.config.space ||
      delta.sourceUri !== this.config.sourceUri ||
      Date.parse(delta.issuedAt) !== claims.iat * 1_000
    )
      throw invalidCheckpoint()
    this.assertFresh(claims)

    return this.db.transaction(async (tx) => {
      this.assertFresh(claims)
      const now = this.now()
      const row = await tx.db
        .selectFrom('para_space_policy_challenge')
        .selectAll()
        .where('space', '=', this.config.space)
        .where('challengeId', '=', challenge.data.id)
        .executeTakeFirst()
      if (!row || row.secretHash !== digest(challenge.data.secret)) {
        throw invalidChallenge()
      }
      if (row.consumedAt !== null) {
        throw new InvalidRequestError(
          'PARA policy recovery challenge was already consumed',
          'CheckpointChallengeConsumed',
        )
      }
      if (Date.parse(row.expiresAt) <= now.getTime()) {
        throw new InvalidRequestError(
          'PARA policy recovery challenge expired',
          'CheckpointChallengeExpired',
        )
      }
      if (
        row.sourceIssuer !== this.config.issuer ||
        row.sourceUri !== this.config.sourceUri
      )
        throw invalidChallenge()

      const space = await tx.db
        .selectFrom('space')
        .selectAll()
        .where('uri', '=', this.config.space)
        .executeTakeFirst()
      if (!space || space.deletedAt !== null) {
        throw new InvalidRequestError('Space not found', 'SpaceNotFound')
      }
      const reader = new ParaPolicyReader(tx)
      const state = await reader.getPolicyState(this.config.space)
      // @NOTE ready is eligible too (catch-up after expired delivery); the
      // exact accepted version/digest re-check below invalidates the challenge
      // if any ordinary delta moved a healthy projection in the meantime.
      if (
        !state ||
        !['ready', 'stale'].includes(state.projectionStatus) ||
        state.sourceIssuer !== this.config.issuer ||
        state.sourceUri !== this.config.sourceUri ||
        state.sourceVersion !== row.acceptedSourceVersion ||
        state.projectionDigest !== row.acceptedProjectionDigest
      ) {
        throw stateAdvanced()
      }
      const fault = await reader.getPolicyFault(this.config.space)
      const maxSourceVersion = Math.max(
        state.sourceVersion,
        fault?.maxSourceVersion ?? 0,
      )
      const maxPolicyEpoch = Math.max(
        state.policyEpoch,
        fault?.maxPolicyEpoch ?? 0,
      )
      if (
        maxSourceVersion !== row.maxSourceVersion ||
        maxPolicyEpoch !== row.maxPolicyEpoch
      ) {
        throw stateAdvanced()
      }
      if (delta.previousDeltaDigest !== state.projectionDigest) {
        throw invalidProjection()
      }
      if (
        delta.sourceVersion <= maxSourceVersion ||
        delta.policyEpoch <= maxPolicyEpoch
      ) {
        throw invalidProjection()
      }

      // @NOTE consume before installing; a failed write rolls the consumption back.
      const consumed = await tx.db
        .updateTable('para_space_policy_challenge')
        .set({ consumedAt: now.toISOString() })
        .where('space', '=', this.config.space)
        .where('challengeId', '=', challenge.data.id)
        .where('consumedAt', 'is', null)
        .returning('challengeId')
        .executeTakeFirst()
      if (!consumed) {
        throw new InvalidRequestError(
          'PARA policy recovery challenge was already consumed',
          'CheckpointChallengeConsumed',
        )
      }
      const installed = await new ParaPolicyTransactor(
        tx,
        this.authorityDid,
      ).installPolicyCheckpoint(delta, challenge.data.id)
      return {
        issuer: this.config.issuer,
        audience: this.config.audience,
        space: this.config.space,
        sourceUri: this.config.sourceUri,
        sourceVersion: delta.sourceVersion,
        policyEpoch: delta.policyEpoch,
        projectionDigest: installed.projectionDigest,
        challengeId: challenge.data.id,
        installedAt: installed.installedAt,
        projectionStatus: 'ready',
      }
    })
  }

  /**
   * The exact receipt of the last installed checkpoint, while it is still the
   * accepted projection. Use it to reconcile a lost installation response;
   * authenticate the receiver transport before trusting it.
   */
  async getCheckpointReceipt(): Promise<ParaPolicyCheckpointReceipt | null> {
    return this.db.transaction(async (tx) => {
      const space = await tx.db
        .selectFrom('space')
        .selectAll()
        .where('uri', '=', this.config.space)
        .executeTakeFirst()
      if (
        !space ||
        space.deletedAt !== null ||
        space.authority !== this.authorityDid
      )
        return null
      const reader = new ParaPolicyReader(tx)
      const state = await reader.getPolicyState(this.config.space)
      const checkpoint = await tx.db
        .selectFrom('para_space_policy_checkpoint')
        .selectAll()
        .where('space', '=', this.config.space)
        .executeTakeFirst()
      if (
        !state ||
        !checkpoint ||
        state.projectionStatus !== 'ready' ||
        checkpoint.sourceIssuer !== this.config.issuer ||
        checkpoint.sourceUri !== this.config.sourceUri ||
        checkpoint.sourceVersion !== state.sourceVersion ||
        checkpoint.projectionDigest !== state.projectionDigest
      )
        return null
      return {
        issuer: this.config.issuer,
        audience: this.config.audience,
        space: this.config.space,
        sourceUri: this.config.sourceUri,
        sourceVersion: checkpoint.sourceVersion,
        policyEpoch: checkpoint.policyEpoch,
        projectionDigest: checkpoint.projectionDigest,
        challengeId: checkpoint.challengeId,
        installedAt: checkpoint.installedAt,
        projectionStatus: 'ready',
      }
    })
  }

  /** Bounded maintenance; an expired row can never validate an installation. */
  async cleanupExpiredChallenges(): Promise<number> {
    return this.db.transaction(async (tx) =>
      this.deleteExpiredChallenges(tx, this.now().toISOString()),
    )
  }

  private async deleteExpiredChallenges(
    tx: ActorDb,
    nowIso: string,
  ): Promise<number> {
    const deleted = await tx.db
      .deleteFrom('para_space_policy_challenge')
      .where(
        'challengeId',
        'in',
        tx.db
          .selectFrom('para_space_policy_challenge')
          .select('challengeId')
          .where('space', '=', this.config.space)
          .where('expiresAt', '<=', nowIso)
          .orderBy('expiresAt')
          .limit(CLEANUP_BATCH_SIZE),
      )
      .executeTakeFirst()
    return Number(deleted.numDeletedRows)
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
      throw invalidCheckpoint()
  }
}

function invalidCheckpoint(): InvalidRequestError {
  return new InvalidRequestError(
    'Invalid signed PARA policy checkpoint',
    'InvalidPolicyAssertion',
  )
}

function invalidChallenge(): InvalidRequestError {
  return new InvalidRequestError(
    'Invalid PARA policy recovery challenge',
    'InvalidCheckpointChallenge',
  )
}

function invalidProjection(): InvalidRequestError {
  return new InvalidRequestError(
    'Invalid PARA policy checkpoint projection',
    'InvalidCheckpointProjection',
  )
}

function stateAdvanced(): InvalidRequestError {
  return new InvalidRequestError(
    'PARA policy state advanced since the recovery challenge was issued',
    'CheckpointStateAdvanced',
  )
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
