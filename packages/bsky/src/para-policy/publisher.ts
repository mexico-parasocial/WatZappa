import { createHash } from 'node:crypto'
import { type JSONWebKeySet, type KeyLike, SignJWT, exportJWK } from 'jose'
import { CID } from 'multiformats/cid'
import { z } from 'zod'
import {
  AtUri,
  SpaceRef,
  isAtUriString,
  isDatetimeString,
  isValidDid,
  normalizeDatetimeAlways,
} from '@atproto/syntax'

const typ = 'application/para-policy-delta+jwt'
const datetime = z
  .string()
  .refine(isDatetimeString)
  .transform(normalizeDatetimeAlways)
const role = z.string().min(1).max(64)
const roleAssignment = z
  .object({
    role,
    validFrom: datetime.optional(),
    validUntil: datetime.optional(),
    ratifiedBy: z.string().refine(isAtUriString).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.validFrom ||
      !value.validUntil ||
      Date.parse(value.validFrom) < Date.parse(value.validUntil),
  )
const member = z
  .object({
    did: z.string().refine(isValidDid),
    membershipState: z.enum([
      'pending',
      'active',
      'left',
      'removed',
      'blocked',
    ]),
    roles: z.array(role).max(16).default([]),
    roleAssignments: z.array(roleAssignment).max(16).default([]),
  })
  .strict()
const updateSchema = z
  .object({
    kind: z.enum(['snapshot', 'patch']),
    sourceCid: z.string().refine((value) => {
      try {
        return CID.parse(value).toString() === value
      } catch {
        return false
      }
    }),
    sourceVersion: z.number().int().positive().safe(),
    policyEpoch: z.number().int().positive().safe(),
    previousDeltaDigest: z
      .string()
      .regex(/^[0-9a-f]{64}$/u)
      .nullable(),
    members: z.array(member).max(1_000),
  })
  .strict()
  .refine(
    (value) =>
      value.kind !== 'patch' ||
      (value.members.length > 0 && value.previousDeltaDigest !== null),
  )
  .refine(
    (value) =>
      new Set(value.members.map((entry) => entry.did)).size ===
      value.members.length,
  )

/** Governance-authorized material, never an unverified membership-index row. */
export type ParaPolicyUpdate = z.input<typeof updateSchema>

/** Normalize publisher input before hashing its semantic identity for retry detection. */
export function parseParaPolicyUpdate(
  input: unknown,
): z.output<typeof updateSchema> {
  return updateSchema.parse(input)
}

export type ParaPolicyPublisherConfig = {
  issuer: string
  audience: string
  space: string
  sourceUri: string
  kid: string
  lifetimeSec: number
}

/** Persist this entire artifact in an ordered outbox before attempting delivery. */
export type PreparedParaPolicyUpdate = {
  readonly assertion: string
  readonly projectionDigest: string
  readonly sourceVersion: number
  readonly policyEpoch: number
  readonly expiresAt: number
}

/** Draft standalone AppView signer. It neither reads membership tables nor sends updates. */
export class ParaPolicyPublisher {
  private constructor(
    private readonly config: ParaPolicyPublisherConfig,
    private readonly privateKey: KeyLike,
    private readonly publicX: string,
    private readonly now: () => Date,
  ) {}

  /** Load operator-controlled signing material; no key generation or discovery. */
  static async create(
    config: ParaPolicyPublisherConfig,
    privateKey: KeyLike,
    now: () => Date = () => new Date(),
  ): Promise<ParaPolicyPublisher> {
    const copied = { ...config }
    if (
      !isValidDid(copied.issuer) ||
      !copied.audience?.trim() ||
      !copied.kid?.trim() ||
      copied.kid.length > 256 ||
      SpaceRef.parse(copied.space).toString() !== copied.space ||
      !isAtUriString(copied.sourceUri) ||
      !new AtUri(copied.sourceUri).collection ||
      !new AtUri(copied.sourceUri).rkey ||
      !Number.isSafeInteger(copied.lifetimeSec) ||
      copied.lifetimeSec <= 0
    )
      throw new Error('Invalid PARA policy publisher configuration')
    const jwk = await exportJWK(privateKey)
    if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x || !jwk.d) {
      throw new Error('PARA policy publisher requires an Ed25519 private key')
    }
    return new ParaPolicyPublisher(copied, privateKey, jwk.x, now)
  }

  /** Public-only pinning material; each call returns an independent object. */
  getJwks(): JSONWebKeySet {
    return {
      keys: [
        {
          kty: 'OKP',
          crv: 'Ed25519',
          x: this.publicX,
          kid: this.config.kid,
          alg: 'EdDSA',
          use: 'sig',
        },
      ],
    }
  }

  /** Stable stream identity; key rotation must not change these bindings. */
  getBindings(): Pick<
    ParaPolicyPublisherConfig,
    'issuer' | 'audience' | 'space' | 'sourceUri'
  > {
    const { issuer, audience, space, sourceUri } = this.config
    return { issuer, audience, space, sourceUri }
  }

  /**
   * Sign a newly allocated version. The caller must serialize version allocation
   * and persist the returned bytes; retries must resend them, not call prepare again.
   */
  async prepare(input: ParaPolicyUpdate): Promise<PreparedParaPolicyUpdate> {
    const update = parseParaPolicyUpdate(input)
    const iat = Math.floor(this.now().getTime() / 1_000)
    const exp = iat + this.config.lifetimeSec
    if (!Number.isSafeInteger(iat) || iat < 0 || !Number.isSafeInteger(exp)) {
      throw new Error('Invalid PARA policy publisher clock or expiration')
    }
    // @NOTE fixed ordering is part of the draft cross-service digest contract.
    const delta = {
      kind: update.kind,
      space: this.config.space,
      sourceUri: this.config.sourceUri,
      sourceCid: update.sourceCid,
      sourceIssuer: this.config.issuer,
      sourceVersion: update.sourceVersion,
      policyEpoch: update.policyEpoch,
      previousDeltaDigest: update.previousDeltaDigest,
      issuedAt: new Date(iat * 1_000).toISOString(),
      members: update.members.map((entry) => ({
        did: entry.did,
        membershipState: entry.membershipState,
        roles: [...entry.roles],
        roleAssignments: entry.roleAssignments.map((assignment) => ({
          role: assignment.role,
          ...(assignment.validFrom
            ? { validFrom: assignment.validFrom }
            : undefined),
          ...(assignment.validUntil
            ? { validUntil: assignment.validUntil }
            : undefined),
          ...(assignment.ratifiedBy
            ? { ratifiedBy: assignment.ratifiedBy }
            : undefined),
        })),
      })),
    }
    const assertion = await new SignJWT({
      iss: this.config.issuer,
      aud: this.config.audience,
      iat,
      exp,
      delta,
    })
      .setProtectedHeader({ alg: 'EdDSA', typ, kid: this.config.kid })
      .sign(this.privateKey)
    if (assertion.length > 16_384) {
      throw new Error('Signed PARA policy update exceeds the receiver limit')
    }
    const { members, ...metadata } = delta
    const projectionDigest = createHash('sha256')
      .update(JSON.stringify({ ...metadata, signedDelta: assertion, members }))
      .digest('hex')
    return Object.freeze({
      assertion,
      projectionDigest,
      sourceVersion: update.sourceVersion,
      policyEpoch: update.policyEpoch,
      expiresAt: exp,
    })
  }
}
