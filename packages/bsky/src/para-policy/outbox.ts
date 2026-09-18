import { createHash, randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import type {
  ParaPolicyOutboxEntry,
  ParaPolicyPublication,
  PartialDB,
} from '../data-plane/server/db/tables/para-policy-outbox.js'
import {
  type ParaPolicyPublisher,
  type ParaPolicyRecoveryChallenge,
  type ParaPolicyUpdate,
  type PreparedParaPolicyUpdate,
  parseParaPolicyUpdate,
} from './publisher.js'

export type ParaPolicyChange = Pick<
  ParaPolicyUpdate,
  'kind' | 'sourceCid' | 'members'
>
export type ParaPolicyDelivery =
  | { status: 'empty' | 'busy' | 'recovery-required' | 'checkpoint-pending' }
  | { status: 'claimed'; leaseToken: string; update: PreparedParaPolicyUpdate }
export type ParaPolicyCheckpointDelivery =
  | { status: 'unavailable' | 'busy' | 'expired' }
  | {
      status: 'claimed'
      leaseToken: string
      challengeId: string
      update: PreparedParaPolicyUpdate
    }
const MAX_PENDING = 100
const LEASE_SEC = 30
const acceptedReceiptSchema = z
  .object({
    issuer: z.string(),
    audience: z.string(),
    space: z.string(),
    sourceUri: z.string(),
    sourceVersion: z.number().int().positive().safe(),
    projectionDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    projectionStatus: z.literal('ready'),
  })
  .strict()
const checkpointReceiptSchema = z
  .object({
    issuer: z.string(),
    audience: z.string(),
    space: z.string(),
    sourceUri: z.string(),
    sourceVersion: z.number().int().positive().safe(),
    policyEpoch: z.number().int().positive().safe(),
    projectionDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    challengeId: z.string().min(1).max(256),
    installedAt: z.string().min(1),
    projectionStatus: z.literal('ready'),
  })
  .strict()

export type ParaPolicyAcceptedReceipt = z.infer<typeof acceptedReceiptSchema>
export type ParaPolicyCheckpointReceipt = z.infer<
  typeof checkpointReceiptSchema
>

/** PostgreSQL outbox; no networking. Construct per configured publisher stream. */
export class ParaPolicyOutbox {
  private readonly bindings: ReturnType<ParaPolicyPublisher['getBindings']>

  constructor(
    private readonly db: Kysely<PartialDB>,
    private readonly publisher: ParaPolicyPublisher,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.bindings = publisher.getBindings()
  }

  /** Enqueue inside the SAME transaction as the authorized governance mutation. */
  async enqueue(
    eventId: string,
    input: ParaPolicyChange,
  ): Promise<PreparedParaPolicyUpdate> {
    if (!this.db.isTransaction)
      throw new Error('Policy enqueue requires a governance transaction')
    if (
      typeof eventId !== 'string' ||
      !eventId.trim() ||
      eventId.length > 256 ||
      !input ||
      Object.keys(input).some(
        (key) => !['kind', 'sourceCid', 'members'].includes(key),
      )
    ) {
      throw new Error('Invalid policy outbox event')
    }
    const normalized = parseParaPolicyUpdate({
      ...input,
      sourceVersion: 1,
      policyEpoch: 1,
      previousDeltaDigest: input.kind === 'patch' ? '0'.repeat(64) : null,
    })
    const change = {
      kind: normalized.kind,
      sourceCid: normalized.sourceCid,
      members: normalized.members,
    }
    const inputDigest = digest(JSON.stringify(change))
    await this.db
      .insertInto('para_policy_publication')
      .values({
        ...this.bindings,
        sourceVersion: 0,
        policyEpoch: 0,
        projectionDigest: null,
        acknowledgedVersion: 0,
        deliveryStatus: 'ready',
      })
      .onConflict((oc) => oc.column('space').doNothing())
      .execute()
    const stream = await this.lockStream(this.db)
    if (!stream) throw new Error('Policy publication stream missing')
    const existing = await this.db
      .selectFrom('para_policy_outbox')
      .selectAll()
      .where('space', '=', this.bindings.space)
      .where('eventId', '=', eventId)
      .executeTakeFirst()
    if (existing) {
      if (existing.inputDigest !== inputDigest)
        throw new Error('Policy event ID reused with different material')
      return artifact(existing)
    }
    if (stream.deliveryStatus === 'checkpoint-pending')
      throw new Error('Policy stream has a pending checkpoint recovery')
    if (stream.deliveryStatus !== 'ready')
      throw new Error('Policy stream requires recovery')
    if (stream.sourceVersion - stream.acknowledgedVersion >= MAX_PENDING) {
      throw new Error('Policy outbox pending limit reached')
    }
    if (stream.sourceVersion === 0 && change.kind !== 'snapshot') {
      throw new Error('Policy publication must bootstrap with a full snapshot')
    }
    const sourceVersion = stream.sourceVersion + 1
    const policyEpoch = stream.policyEpoch + 1
    if (
      !Number.isSafeInteger(sourceVersion) ||
      !Number.isSafeInteger(policyEpoch)
    ) {
      throw new Error('Policy sequence exhausted')
    }
    const prepared = await this.publisher.prepare({
      ...change,
      sourceVersion,
      policyEpoch,
      previousDeltaDigest: stream.projectionDigest,
    })
    if (prepared.expiresAt <= this.currentTime())
      throw new Error('Policy update expired before enqueue')
    await this.db
      .insertInto('para_policy_outbox')
      .values({
        ...prepared,
        space: this.bindings.space,
        eventId,
        inputDigest,
        artifactKind: 'update',
        challengeId: null,
        supersededAt: null,
        leaseTokenHash: null,
        leaseUntil: null,
        acknowledgedAt: null,
      })
      .execute()
    await this.db
      .updateTable('para_policy_publication')
      .set({
        sourceVersion,
        policyEpoch,
        projectionDigest: prepared.projectionDigest,
      })
      .where('space', '=', this.bindings.space)
      .execute()
    return prepared
  }

  /** Read-only stream state for delivery coordination decisions. */
  async streamState(): Promise<{
    sourceVersion: number
    acknowledgedVersion: number
    deliveryStatus: 'ready' | 'recovery-required' | 'checkpoint-pending'
  }> {
    const stream = await this.db
      .selectFrom('para_policy_publication')
      .select([
        'sourceVersion',
        'acknowledgedVersion',
        'deliveryStatus',
      ])
      .where('space', '=', this.bindings.space)
      .executeTakeFirst()
    return (
      stream ?? {
        sourceVersion: 0,
        acknowledgedVersion: 0,
        deliveryStatus: 'ready',
      }
    )
  }

  /** Lease only the next unacknowledged version; network I/O happens after commit. */
  async claim(): Promise<ParaPolicyDelivery> {
    this.assertNotTransaction()
    return this.db.transaction().execute(async (tx) => {
      const stream = await this.lockStream(tx)
      if (!stream) return { status: 'empty' }
      if (stream.deliveryStatus === 'checkpoint-pending')
        return { status: 'checkpoint-pending' }
      if (stream.deliveryStatus !== 'ready')
        return { status: 'recovery-required' }
      if (stream.sourceVersion === stream.acknowledgedVersion)
        return { status: 'empty' }
      const head = await tx
        .selectFrom('para_policy_outbox')
        .selectAll()
        .where('space', '=', this.bindings.space)
        .where('sourceVersion', '=', stream.acknowledgedVersion + 1)
        .executeTakeFirstOrThrow()
      const now = this.currentTime()
      if (head.leaseUntil !== null && head.leaseUntil > now)
        return { status: 'busy' }
      if (head.expiresAt <= now) {
        await tx
          .updateTable('para_policy_publication')
          .set({ deliveryStatus: 'recovery-required' })
          .where('space', '=', this.bindings.space)
          .execute()
        return { status: 'recovery-required' }
      }
      const leaseToken = randomBytes(32).toString('base64url')
      await tx
        .updateTable('para_policy_outbox')
        .set({
          leaseTokenHash: digest(leaseToken),
          leaseUntil: now + LEASE_SEC,
        })
        .where('space', '=', this.bindings.space)
        .where('sourceVersion', '=', head.sourceVersion)
        .execute()
      return { status: 'claimed', leaseToken, update: artifact(head) }
    })
  }

  /** Call only after an authenticated receiver confirms this exact version/digest. */
  async acknowledge(
    sourceVersion: number,
    projectionDigest: string,
    leaseToken: string,
  ): Promise<boolean> {
    this.assertNotTransaction()
    if (
      !Number.isSafeInteger(sourceVersion) ||
      sourceVersion < 1 ||
      !/^[0-9a-f]{64}$/u.test(projectionDigest) ||
      typeof leaseToken !== 'string' ||
      leaseToken.length > 256
    )
      return false
    return this.db.transaction().execute(async (tx) => {
      const stream = await this.lockStream(tx)
      if (
        !stream ||
        stream.deliveryStatus !== 'ready' ||
        sourceVersion !== stream.acknowledgedVersion + 1
      )
        return false
      const now = this.currentTime()
      const updated = await tx
        .updateTable('para_policy_outbox')
        .set({ acknowledgedAt: now, leaseTokenHash: null, leaseUntil: null })
        .where('space', '=', this.bindings.space)
        .where('sourceVersion', '=', sourceVersion)
        .where('projectionDigest', '=', projectionDigest)
        .where('leaseTokenHash', '=', digest(leaseToken))
        .where('leaseUntil', '>', now)
        .where('acknowledgedAt', 'is', null)
        .returning('sourceVersion')
        .executeTakeFirst()
      if (!updated) return false
      await tx
        .updateTable('para_policy_publication')
        .set({ acknowledgedVersion: sourceVersion })
        .where('space', '=', this.bindings.space)
        .execute()
      return true
    })
  }

  /**
   * Reconcile a lost acknowledgement only from an authenticated receiver receipt.
   * This changes delivery bookkeeping, never the receiver's policy or stale latch.
   */
  async reconcileAccepted(input: ParaPolicyAcceptedReceipt): Promise<boolean> {
    this.assertNotTransaction()
    const parsed = acceptedReceiptSchema.safeParse(input)
    if (!parsed.success) return false
    const receipt = parsed.data
    if (
      receipt.space !== this.bindings.space ||
      receipt.issuer !== this.bindings.issuer ||
      receipt.audience !== this.bindings.audience ||
      receipt.sourceUri !== this.bindings.sourceUri
    )
      return false
    return this.db.transaction().execute(async (tx) => {
      const stream = await this.lockStream(tx)
      if (
        !stream ||
        receipt.sourceVersion < stream.acknowledgedVersion ||
        receipt.sourceVersion > stream.sourceVersion
      )
        return false
      const accepted = await tx
        .selectFrom('para_policy_outbox')
        .select('projectionDigest')
        .where('space', '=', this.bindings.space)
        .where('sourceVersion', '=', receipt.sourceVersion)
        .executeTakeFirst()
      if (!accepted || accepted.projectionDigest !== receipt.projectionDigest)
        return false
      // @NOTE an old receipt cannot clear a stop on a later expired head.
      if (receipt.sourceVersion === stream.acknowledgedVersion) return true
      const now = this.currentTime()
      const next =
        receipt.sourceVersion < stream.sourceVersion
          ? await tx
              .selectFrom('para_policy_outbox')
              .select('expiresAt')
              .where('space', '=', this.bindings.space)
              .where('sourceVersion', '=', receipt.sourceVersion + 1)
              .executeTakeFirstOrThrow()
          : undefined
      await tx
        .updateTable('para_policy_outbox')
        .set({ acknowledgedAt: now, leaseTokenHash: null, leaseUntil: null })
        .where('space', '=', this.bindings.space)
        .where('sourceVersion', '<=', receipt.sourceVersion)
        .where('acknowledgedAt', 'is', null)
        .execute()
      await tx
        .updateTable('para_policy_publication')
        .set({
          acknowledgedVersion: receipt.sourceVersion,
          deliveryStatus:
            next && next.expiresAt <= now ? 'recovery-required' : 'ready',
        })
        .where('space', '=', this.bindings.space)
        .execute()
      return true
    })
  }

  /**
   * Prepare a recovery checkpoint inside the SAME authorized governance
   * transaction as the snapshot decision. The snapshot material must come
   * from that governance decision, never from client-submitted roles or raw
   * membership index rows. Version and epoch are reserved independently,
   * each above the publisher head and the receiver's verified floor.
   */
  async prepareCheckpoint(
    eventId: string,
    challenge: ParaPolicyRecoveryChallenge,
    input: ParaPolicyChange,
  ): Promise<PreparedParaPolicyUpdate> {
    if (!this.db.isTransaction)
      throw new Error('Policy checkpoint requires a governance transaction')
    if (
      typeof eventId !== 'string' ||
      !eventId.trim() ||
      eventId.length > 256 ||
      !input ||
      Object.keys(input).some(
        (key) => !['kind', 'sourceCid', 'members'].includes(key),
      )
    ) {
      throw new Error('Invalid policy outbox event')
    }
    const normalized = parseParaPolicyUpdate({
      ...input,
      kind: 'snapshot',
      sourceVersion: 1,
      policyEpoch: 1,
      previousDeltaDigest: challenge.acceptedProjectionDigest,
    })
    const change = {
      sourceCid: normalized.sourceCid,
      members: normalized.members,
    }
    const inputDigest = digest(
      JSON.stringify({
        ...change,
        challenge: { id: challenge.id, secret: challenge.secret },
      }),
    )
    await this.db
      .insertInto('para_policy_publication')
      .values({
        ...this.bindings,
        sourceVersion: 0,
        policyEpoch: 0,
        projectionDigest: null,
        acknowledgedVersion: 0,
        deliveryStatus: 'ready',
      })
      .onConflict((oc) => oc.column('space').doNothing())
      .execute()
    const stream = await this.lockStream(this.db)
    if (!stream) throw new Error('Policy publication stream missing')
    const existing = await this.db
      .selectFrom('para_policy_outbox')
      .selectAll()
      .where('space', '=', this.bindings.space)
      .where('eventId', '=', eventId)
      .executeTakeFirst()
    if (existing) {
      if (existing.inputDigest !== inputDigest)
        throw new Error('Policy event ID reused with different material')
      return artifact(existing)
    }
    if (stream.deliveryStatus === 'checkpoint-pending') {
      const pending = await this.db
        .selectFrom('para_policy_outbox')
        .selectAll()
        .where('space', '=', this.bindings.space)
        .where('artifactKind', '=', 'checkpoint')
        .where('acknowledgedAt', 'is', null)
        .where('supersededAt', 'is', null)
        .orderBy('sourceVersion', 'desc')
        .executeTakeFirst()
      const now = this.currentTime()
      if (!pending || pending.expiresAt > now)
        throw new Error('A policy checkpoint recovery is already pending')
      await this.db
        .updateTable('para_policy_outbox')
        .set({ supersededAt: now, leaseTokenHash: null, leaseUntil: null })
        .where('space', '=', this.bindings.space)
        .where('sourceVersion', '=', pending.sourceVersion)
        .execute()
    }
    const sourceVersion =
      Math.max(
        stream.sourceVersion,
        challenge.maxSourceVersion,
        challenge.acceptedSourceVersion,
      ) + 1
    const policyEpoch =
      Math.max(stream.policyEpoch, challenge.maxPolicyEpoch) + 1
    if (
      !Number.isSafeInteger(sourceVersion) ||
      !Number.isSafeInteger(policyEpoch)
    ) {
      throw new Error('Policy sequence exhausted')
    }
    const prepared = await this.publisher.prepareCheckpoint(
      challenge,
      { sourceVersion, policyEpoch },
      change,
    )
    if (prepared.expiresAt <= this.currentTime())
      throw new Error('Policy checkpoint expired before enqueue')
    await this.db
      .insertInto('para_policy_outbox')
      .values({
        ...prepared,
        space: this.bindings.space,
        eventId,
        inputDigest,
        artifactKind: 'checkpoint',
        challengeId: challenge.id,
        supersededAt: null,
        leaseTokenHash: null,
        leaseUntil: null,
        acknowledgedAt: null,
      })
      .execute()
    await this.db
      .updateTable('para_policy_publication')
      .set({
        sourceVersion,
        policyEpoch,
        projectionDigest: prepared.projectionDigest,
        deliveryStatus: 'checkpoint-pending',
      })
      .where('space', '=', this.bindings.space)
      .execute()
    return prepared
  }

  /** Lease the pending recovery checkpoint; network I/O happens after commit. */
  async claimCheckpoint(): Promise<ParaPolicyCheckpointDelivery> {
    this.assertNotTransaction()
    return this.db.transaction().execute(async (tx) => {
      const stream = await this.lockStream(tx)
      if (!stream || stream.deliveryStatus !== 'checkpoint-pending')
        return { status: 'unavailable' }
      const head = await tx
        .selectFrom('para_policy_outbox')
        .selectAll()
        .where('space', '=', this.bindings.space)
        .where('artifactKind', '=', 'checkpoint')
        .where('acknowledgedAt', 'is', null)
        .where('supersededAt', 'is', null)
        .orderBy('sourceVersion', 'desc')
        .executeTakeFirstOrThrow()
      if (!head.challengeId) return { status: 'unavailable' }
      const now = this.currentTime()
      if (head.leaseUntil !== null && head.leaseUntil > now)
        return { status: 'busy' }
      if (head.expiresAt <= now) return { status: 'expired' }
      const leaseToken = randomBytes(32).toString('base64url')
      await tx
        .updateTable('para_policy_outbox')
        .set({
          leaseTokenHash: digest(leaseToken),
          leaseUntil: now + LEASE_SEC,
        })
        .where('space', '=', this.bindings.space)
        .where('sourceVersion', '=', head.sourceVersion)
        .execute()
      return {
        status: 'claimed',
        leaseToken,
        challengeId: head.challengeId,
        update: artifact(head),
      }
    })
  }

  /** Call only after the authenticated receiver confirms this exact checkpoint. */
  async acknowledgeCheckpoint(
    sourceVersion: number,
    projectionDigest: string,
    challengeId: string,
    leaseToken: string,
  ): Promise<boolean> {
    this.assertNotTransaction()
    if (
      !Number.isSafeInteger(sourceVersion) ||
      sourceVersion < 1 ||
      !/^[0-9a-f]{64}$/u.test(projectionDigest) ||
      typeof challengeId !== 'string' ||
      !challengeId.trim() ||
      challengeId.length > 256 ||
      typeof leaseToken !== 'string' ||
      leaseToken.length > 256
    )
      return false
    return this.db.transaction().execute(async (tx) => {
      const stream = await this.lockStream(tx)
      if (!stream || stream.deliveryStatus !== 'checkpoint-pending')
        return false
      const entry = await this.findCheckpoint(tx, {
        sourceVersion,
        policyEpoch: stream.policyEpoch,
        projectionDigest,
        challengeId,
      })
      if (!entry || entry.acknowledgedAt !== null) return false
      const now = this.currentTime()
      const leased = await tx
        .updateTable('para_policy_outbox')
        .set({ acknowledgedAt: now, leaseTokenHash: null, leaseUntil: null })
        .where('space', '=', this.bindings.space)
        .where('sourceVersion', '=', entry.sourceVersion)
        .where('leaseTokenHash', '=', digest(leaseToken))
        .where('leaseUntil', '>', now)
        .where('acknowledgedAt', 'is', null)
        .returning('sourceVersion')
        .executeTakeFirst()
      if (!leased) return false
      await this.finalizeCheckpoint(tx, entry.sourceVersion, now)
      return true
    })
  }

  /**
   * Reconcile a lost checkpoint confirmation only from an authenticated
   * receiver receipt. Idempotent; it changes delivery bookkeeping, never the
   * receiver's policy or stale latch.
   */
  async reconcileCheckpoint(
    receipt: ParaPolicyCheckpointReceipt,
  ): Promise<boolean> {
    this.assertNotTransaction()
    const parsed = checkpointReceiptSchema.safeParse(receipt)
    if (!parsed.success) return false
    const value = parsed.data
    if (
      value.space !== this.bindings.space ||
      value.issuer !== this.bindings.issuer ||
      value.audience !== this.bindings.audience ||
      value.sourceUri !== this.bindings.sourceUri
    )
      return false
    return this.db.transaction().execute(async (tx) => {
      const stream = await this.lockStream(tx)
      if (!stream) return false
      const entry = await this.findCheckpoint(tx, {
        sourceVersion: value.sourceVersion,
        policyEpoch: value.policyEpoch,
        projectionDigest: value.projectionDigest,
        challengeId: value.challengeId,
      })
      if (!entry) return false
      if (entry.acknowledgedAt !== null)
        return stream.acknowledgedVersion >= entry.sourceVersion
      if (stream.deliveryStatus !== 'checkpoint-pending') return false
      const now = this.currentTime()
      await tx
        .updateTable('para_policy_outbox')
        .set({ acknowledgedAt: now, leaseTokenHash: null, leaseUntil: null })
        .where('space', '=', this.bindings.space)
        .where('sourceVersion', '=', entry.sourceVersion)
        .execute()
      await this.finalizeCheckpoint(tx, entry.sourceVersion, now)
      return true
    })
  }

  private async findCheckpoint(
    db: Kysely<PartialDB>,
    match: {
      sourceVersion: number
      policyEpoch: number
      projectionDigest: string
      challengeId: string
    },
  ): Promise<ParaPolicyOutboxEntry | undefined> {
    return db
      .selectFrom('para_policy_outbox')
      .selectAll()
      .where('space', '=', this.bindings.space)
      .where('artifactKind', '=', 'checkpoint')
      .where('sourceVersion', '=', match.sourceVersion)
      .where('policyEpoch', '=', match.policyEpoch)
      .where('projectionDigest', '=', match.projectionDigest)
      .where('challengeId', '=', match.challengeId)
      .where('supersededAt', 'is', null)
      .executeTakeFirst()
  }

  /** Release the recovery latch, fence superseded events, resume delivery. */
  private async finalizeCheckpoint(
    tx: Kysely<PartialDB>,
    sourceVersion: number,
    now: number,
  ): Promise<void> {
    await tx
      .updateTable('para_policy_outbox')
      .set({ supersededAt: now, leaseTokenHash: null, leaseUntil: null })
      .where('space', '=', this.bindings.space)
      .where('sourceVersion', '<', sourceVersion)
      .where('acknowledgedAt', 'is', null)
      .execute()
    await tx
      .updateTable('para_policy_publication')
      .set({ acknowledgedVersion: sourceVersion, deliveryStatus: 'ready' })
      .where('space', '=', this.bindings.space)
      .execute()
  }

  private async lockStream(
    db: Kysely<PartialDB>,
  ): Promise<ParaPolicyPublication | undefined> {
    const stream = await db
      .selectFrom('para_policy_publication')
      .selectAll()
      .where('space', '=', this.bindings.space)
      .forUpdate()
      .executeTakeFirst()
    if (
      stream &&
      (stream.issuer !== this.bindings.issuer ||
        stream.audience !== this.bindings.audience ||
        stream.sourceUri !== this.bindings.sourceUri)
    )
      throw new Error('Policy publication source binding changed')
    return stream
  }

  private assertNotTransaction(): void {
    if (this.db.isTransaction)
      throw new Error('Delivery requires its own committed transaction')
  }

  private currentTime(): number {
    const now = Math.floor(this.now().getTime() / 1_000)
    if (!Number.isSafeInteger(now) || now < 0)
      throw new Error('Invalid policy outbox clock')
    return now
  }
}

function artifact(row: ParaPolicyOutboxEntry): PreparedParaPolicyUpdate {
  return Object.freeze({
    assertion: row.assertion,
    projectionDigest: row.projectionDigest,
    sourceVersion: row.sourceVersion,
    policyEpoch: row.policyEpoch,
    expiresAt: row.expiresAt,
  })
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
