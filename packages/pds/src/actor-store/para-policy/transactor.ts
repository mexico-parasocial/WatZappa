import { createHash } from 'node:crypto'
import { z } from 'zod'
import { validateCidString } from '@atproto/lex-data'
import {
  AtUri,
  SpaceRef,
  isAtUriString,
  isDatetimeString,
  isValidDid,
  normalizeDatetimeAlways,
} from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { ActorDb } from '../db/index.js'
import { ParaPolicyReader } from './reader.js'
import type {
  ParaPolicyMember,
  ParaPolicyProjectionDelta,
  ParaPolicyProjectionKind,
} from './types.js'

const membershipStateSchema = z.enum([
  'pending',
  'active',
  'left',
  'removed',
  'blocked',
])

const roleSchema = z.string().min(1).max(64)
const datetimeSchema = z
  .string()
  .refine(isDatetimeString, 'Expected an AT Protocol datetime')
  .transform(normalizeDatetimeAlways)
const atUriSchema = z
  .string()
  .refine(isAtUriString, 'Expected a canonical AT URI')
const didSchema = z.string().refine(isValidDid, 'Expected a valid DID')
const cidSchema = z
  .string()
  .refine(validateCidString, 'Expected a canonical CID')
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/u, 'Expected a SHA-256')

const roleAssignmentSchema = z
  .object({
    role: roleSchema,
    validFrom: datetimeSchema.optional(),
    validUntil: datetimeSchema.optional(),
    ratifiedBy: atUriSchema.optional(),
  })
  .strict()
  .superRefine((assignment, ctx) => {
    if (
      assignment.validFrom &&
      assignment.validUntil &&
      Date.parse(assignment.validFrom) >= Date.parse(assignment.validUntil)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validUntil must be after validFrom',
        path: ['validUntil'],
      })
    }
  })

const memberInputSchema = z
  .object({
    did: didSchema,
    membershipState: membershipStateSchema,
    roles: z.array(roleSchema).max(16).default([]),
    roleAssignments: z.array(roleAssignmentSchema).max(16).default([]),
  })
  .strict()

const projectionKindSchema = z.enum(['snapshot', 'patch'])
const projectionDeltaSchema = z
  .object({
    kind: projectionKindSchema,
    space: z.string().refine(isSpaceRef, 'Expected a canonical space URI'),
    sourceUri: atUriSchema.refine(isRecordUri, 'Expected an AT record URI'),
    sourceCid: cidSchema,
    sourceIssuer: didSchema,
    sourceVersion: z.number().int().positive().safe(),
    policyEpoch: z.number().int().positive().safe(),
    previousDeltaDigest: digestSchema.nullable(),
    issuedAt: datetimeSchema,
    signedDelta: z.string().min(1).max(16_384),
    members: z.array(memberInputSchema),
  })
  .strict()
  .superRefine((delta, ctx) => {
    if (delta.kind === 'patch' && delta.members.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A policy patch must name at least one member',
        path: ['members'],
      })
    }

    const dids = new Set<string>()
    for (const [index, member] of delta.members.entries()) {
      if (dids.has(member.did)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate PARA policy member: ${member.did}`,
          path: ['members', index, 'did'],
        })
      }
      dids.add(member.did)
    }
  })

type NormalizedParaPolicyMember = Pick<
  ParaPolicyMember,
  'did' | 'membershipState' | 'roles' | 'roleAssignments'
>

type NormalizedParaPolicyDelta = Omit<
  ParaPolicyProjectionDelta,
  'members' | 'kind'
> & {
  kind: ParaPolicyProjectionKind
  members: NormalizedParaPolicyMember[]
  projectionDigest: string
}

export class ParaPolicyTransactor extends ParaPolicyReader {
  constructor(
    public readonly db: ActorDb,
    private readonly authorityDid: string,
  ) {
    super(db)
  }

  /**
   * Applies exactly one verified control-plane projection. Callers must already
   * have verified the signed delta; this layer validates its extracted payload,
   * ordering, chain, authority ownership, and epoch in one DB transaction.
   */
  async applyPolicyDelta(input: ParaPolicyProjectionDelta): Promise<void> {
    this.db.assertTransaction()
    const delta = normalizeDelta(input)
    this.assertAuthority(delta.space)
    await this.assertSpaceAvailable(delta.space)

    const previous = await this.getPolicyState(delta.space)
    if (this.assertOrdering(previous, delta)) return

    await this.persistProjection(delta, new Date().toISOString())
  }

  /**
   * Install a fully verified recovery checkpoint as the new accepted
   * projection. The caller has already verified the signed envelope, consumed
   * its single-use challenge, and re-checked the accepted state and fault
   * floors inside this same transaction. Unlike a delta, a checkpoint is
   * allowed to jump the source version above the verified floors.
   */
  async installPolicyCheckpoint(
    input: ParaPolicyProjectionDelta,
    challengeId: string,
  ): Promise<{ projectionDigest: string; installedAt: string }> {
    this.db.assertTransaction()
    const delta = normalizeDelta(input)
    if (delta.kind !== 'snapshot') {
      throw new InvalidRequestError(
        'A PARA policy checkpoint must be a full snapshot',
        'InvalidPolicyProjection',
      )
    }
    if (!challengeId.trim() || challengeId.length > 256) {
      throw new InvalidRequestError(
        'Invalid PARA policy checkpoint challenge binding',
        'InvalidPolicyProjection',
      )
    }
    this.assertAuthority(delta.space)
    await this.assertSpaceAvailable(delta.space)

    const installedAt = new Date().toISOString()
    await this.persistProjection(delta, installedAt)
    const checkpoint = {
      sourceIssuer: delta.sourceIssuer,
      sourceUri: delta.sourceUri,
      sourceVersion: delta.sourceVersion,
      policyEpoch: delta.policyEpoch,
      projectionDigest: delta.projectionDigest,
      challengeId,
      installedAt,
      signedCheckpoint: delta.signedDelta,
    }
    await this.db.db
      .insertInto('para_space_policy_checkpoint')
      .values({ space: delta.space, ...checkpoint })
      .onConflict((oc) => oc.column('space').doUpdateSet(checkpoint))
      .execute()
    return { projectionDigest: delta.projectionDigest, installedAt }
  }

  /** Record only signature-verified stream faults; never clears stale state. */
  async recordPolicyFault(input: ParaPolicyProjectionDelta): Promise<void> {
    this.db.assertTransaction()
    const delta = parseParaPolicyDelta(input)
    this.assertAuthority(delta.space)
    const previous = await this.getPolicyState(delta.space)
    if (!previous || !['ready', 'stale'].includes(previous.projectionStatus)) {
      throw new ParaPolicyRebootstrapRequiredError(delta.space)
    }
    if (
      delta.sourceIssuer !== previous.sourceIssuer ||
      delta.sourceUri !== previous.sourceUri
    ) {
      throw new ParaPolicySourceChangedError(delta.space)
    }
    if (delta.sourceVersion < previous.sourceVersion) return
    const fault = await this.getPolicyFault(delta.space)
    if (
      fault &&
      (fault.sourceIssuer !== delta.sourceIssuer ||
        fault.sourceUri !== delta.sourceUri)
    ) {
      throw new ParaPolicySourceChangedError(delta.space)
    }
    const maxSourceVersion = Math.max(
      previous.sourceVersion,
      fault?.maxSourceVersion ?? 0,
      delta.sourceVersion,
    )
    const maxPolicyEpoch = Math.max(
      previous.policyEpoch,
      fault?.maxPolicyEpoch ?? 0,
      delta.policyEpoch,
    )
    const versionEvidence =
      fault && fault.maxSourceVersion >= maxSourceVersion
        ? fault.versionEvidence
        : delta.sourceVersion >= previous.sourceVersion
          ? delta.signedDelta
          : previous.signedDelta
    const epochEvidence =
      fault && fault.maxPolicyEpoch >= maxPolicyEpoch
        ? fault.epochEvidence
        : delta.policyEpoch >= previous.policyEpoch
          ? delta.signedDelta
          : previous.signedDelta
    if (
      !fault ||
      fault.maxSourceVersion !== maxSourceVersion ||
      fault.maxPolicyEpoch !== maxPolicyEpoch
    ) {
      const record = {
        sourceIssuer: delta.sourceIssuer,
        sourceUri: delta.sourceUri,
        maxSourceVersion,
        maxPolicyEpoch,
        versionEvidence,
        epochEvidence,
        observedAt: new Date().toISOString(),
      }
      await this.db.db
        .insertInto('para_space_policy_fault')
        .values({ space: delta.space, ...record })
        .onConflict((oc) => oc.column('space').doUpdateSet(record))
        .execute()
    }
    await this.db.db
      .updateTable('para_space_policy_state')
      .set({ projectionStatus: 'stale' })
      .where('space', '=', delta.space)
      .execute()
  }

  private assertOrdering(
    previous: Awaited<ReturnType<ParaPolicyReader['getPolicyState']>>,
    delta: NormalizedParaPolicyDelta,
  ): boolean {
    if (!previous) {
      if (delta.kind !== 'snapshot' || delta.previousDeltaDigest !== null) {
        throw new InvalidRequestError(
          'The first PARA policy projection must be a snapshot with no predecessor',
          'InvalidPolicyProjection',
        )
      }
      return false
    }

    if (
      previous.sourceUri !== delta.sourceUri ||
      previous.sourceIssuer !== delta.sourceIssuer
    ) {
      throw new ParaPolicySourceChangedError(delta.space)
    }
    if (delta.sourceVersion === previous.sourceVersion) {
      if (
        previous.projectionStatus === 'ready' &&
        previous.projectionDigest === delta.projectionDigest
      ) {
        return true
      }
      if (previous.projectionStatus !== 'ready') {
        throw new ParaPolicyRebootstrapRequiredError(delta.space)
      }
      throw new ParaPolicyVersionError(
        delta.space,
        previous.sourceVersion + 1,
        delta.sourceVersion,
      )
    }
    if (delta.sourceVersion !== previous.sourceVersion + 1) {
      throw new ParaPolicyVersionError(
        delta.space,
        previous.sourceVersion + 1,
        delta.sourceVersion,
      )
    }
    if (delta.previousDeltaDigest !== previous.projectionDigest) {
      throw new ParaPolicyChainError(delta.space)
    }
    if (previous.projectionStatus !== 'ready' && delta.kind !== 'snapshot') {
      throw new ParaPolicyRebootstrapRequiredError(delta.space)
    }
    if (delta.policyEpoch <= previous.policyEpoch) {
      throw new ParaPolicyEpochError(
        delta.space,
        previous.policyEpoch,
        delta.policyEpoch,
      )
    }
    return false
  }

  private async persistProjection(
    delta: NormalizedParaPolicyDelta,
    receivedAt: string,
  ): Promise<void> {
    const receipt = {
      sourceVersion: delta.sourceVersion,
      kind: delta.kind,
      sourceUri: delta.sourceUri,
      sourceCid: delta.sourceCid,
      sourceIssuer: delta.sourceIssuer,
      policyEpoch: delta.policyEpoch,
      previousDeltaDigest: delta.previousDeltaDigest,
      projectionDigest: delta.projectionDigest,
      issuedAt: delta.issuedAt,
      receivedAt,
      signedDelta: delta.signedDelta,
    }
    await this.db.db
      .insertInto('para_space_policy_delta')
      .values({ space: delta.space, ...receipt })
      .execute()

    const state = {
      sourceUri: delta.sourceUri,
      sourceCid: delta.sourceCid,
      sourceIssuer: delta.sourceIssuer,
      sourceVersion: delta.sourceVersion,
      policyEpoch: delta.policyEpoch,
      projectionDigest: delta.projectionDigest,
      projectionStatus: 'ready',
      issuedAt: delta.issuedAt,
      receivedAt,
      signedDelta: delta.signedDelta,
    }
    await this.db.db
      .insertInto('para_space_policy_state')
      .values({ space: delta.space, ...state })
      .onConflict((oc) => oc.column('space').doUpdateSet(state))
      .execute()

    await this.upsertMembers(delta, receivedAt)
    if (delta.kind === 'snapshot') {
      await this.retireMembersAbsentFromSnapshot(delta, receivedAt)
    }
  }

  private async assertSpaceAvailable(space: string): Promise<void> {
    const row = await this.db.db
      .selectFrom('space')
      .select(['uri', 'deletedAt'])
      .where('uri', '=', space)
      .executeTakeFirst()
    if (!row || row.deletedAt) {
      throw new InvalidRequestError('Space not found', 'SpaceNotFound')
    }
  }

  private async upsertMembers(
    delta: NormalizedParaPolicyDelta,
    updatedAt: string,
  ): Promise<void> {
    for (const member of delta.members) {
      const value = {
        membershipState: member.membershipState,
        roles: JSON.stringify(member.roles),
        roleAssignments: JSON.stringify(member.roleAssignments),
        sourceVersion: delta.sourceVersion,
        updatedAt,
      }
      await this.db.db
        .insertInto('para_space_policy_member')
        .values({ space: delta.space, did: member.did, ...value })
        .onConflict((oc) => oc.columns(['space', 'did']).doUpdateSet(value))
        .execute()
    }
  }

  private async retireMembersAbsentFromSnapshot(
    delta: NormalizedParaPolicyDelta,
    updatedAt: string,
  ): Promise<void> {
    const included = new Set(delta.members.map((member) => member.did))
    const existing = await this.listPolicyMembers(delta.space)
    const removed = {
      membershipState: 'removed',
      roles: '[]',
      roleAssignments: '[]',
      sourceVersion: delta.sourceVersion,
      updatedAt,
    }
    for (const member of existing) {
      if (included.has(member.did)) continue
      await this.db.db
        .updateTable('para_space_policy_member')
        .set(removed)
        .where('space', '=', delta.space)
        .where('did', '=', member.did)
        .execute()
    }
  }

  private assertAuthority(space: string): void {
    const spaceDid = SpaceRef.parse(space).spaceDid
    if (spaceDid !== this.authorityDid) {
      throw new InvalidRequestError(
        'Only the space authority may apply its policy projection',
        'NotSpaceOwner',
      )
    }
  }
}

/** Validates and copies the signed payload before any projection state is touched. */
export function parseParaPolicyDelta(
  input: unknown,
): z.output<typeof projectionDeltaSchema> {
  const parsed = projectionDeltaSchema.safeParse(input)
  if (!parsed.success) {
    throw new InvalidRequestError(
      'Invalid PARA policy projection',
      'InvalidPolicyProjection',
      { cause: parsed.error },
    )
  }

  return parsed.data
}

const normalizeDelta = (
  input: ParaPolicyProjectionDelta,
): NormalizedParaPolicyDelta => {
  const delta = parseParaPolicyDelta(input)
  const members = delta.members.map((member) => ({
    did: member.did,
    membershipState: member.membershipState,
    roles: [...member.roles],
    roleAssignments: member.roleAssignments.map((assignment) => ({
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
  }))
  const normalized = { ...delta, members }
  return {
    ...normalized,
    projectionDigest: projectionDigest(normalized),
  }
}

const projectionDigest = (
  delta: Omit<NormalizedParaPolicyDelta, 'projectionDigest'>,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        kind: delta.kind,
        space: delta.space,
        sourceUri: delta.sourceUri,
        sourceCid: delta.sourceCid,
        sourceIssuer: delta.sourceIssuer,
        sourceVersion: delta.sourceVersion,
        policyEpoch: delta.policyEpoch,
        previousDeltaDigest: delta.previousDeltaDigest,
        issuedAt: delta.issuedAt,
        signedDelta: delta.signedDelta,
        members: delta.members,
      }),
    )
    .digest('hex')

function isSpaceRef(value: string): boolean {
  try {
    return SpaceRef.parse(value).toString() === value
  } catch {
    return false
  }
}

function isRecordUri(value: string): boolean {
  try {
    const uri = new AtUri(value)
    return !!uri.collection && !!uri.rkey
  } catch {
    return false
  }
}

export class ParaPolicyVersionError extends InvalidRequestError {
  name = 'ParaPolicyVersionError'
  constructor(space: string, expected: number, received: number) {
    super(
      `PARA policy delta for ${space} is out of order: expected version ${expected}, received ${received}`,
      'PolicyProjectionOutOfOrder',
    )
  }
}

export class ParaPolicyEpochError extends InvalidRequestError {
  name = 'ParaPolicyEpochError'
  constructor(space: string, current: number, received: number) {
    super(
      `PARA policy epoch for ${space} must advance beyond ${current}, received ${received}`,
      'PolicyProjectionEpochRollback',
    )
  }
}

export class ParaPolicyChainError extends InvalidRequestError {
  name = 'ParaPolicyChainError'
  constructor(space: string) {
    super(
      `PARA policy delta for ${space} does not continue the accepted projection chain`,
      'PolicyProjectionChainMismatch',
    )
  }
}

export class ParaPolicyRebootstrapRequiredError extends InvalidRequestError {
  name = 'ParaPolicyRebootstrapRequiredError'
  constructor(space: string) {
    super(
      `PARA policy projection for ${space} requires a newer full snapshot`,
      'PolicyProjectionRebootstrapRequired',
    )
  }
}

export class ParaPolicySourceChangedError extends InvalidRequestError {
  name = 'ParaPolicySourceChangedError'
  constructor(space: string) {
    super(
      `PARA policy delta for ${space} changed its configured source`,
      'PolicyProjectionSourceMismatch',
    )
  }
}
