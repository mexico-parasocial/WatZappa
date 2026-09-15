import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { SpaceRef, isValidDid } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import {
  M8_ASSURANCE_CLOCK_TOLERANCE_SEC,
  M8_ASSURANCE_MAX_LIFETIME_SEC,
} from '../m8-assurance-constants.js'
import type {
  M8AssuranceBindings,
  M8AssuranceConsumer,
} from '../m8-assurance-verifier.js'
import type { AccountDb } from './db/index.js'

const MAX_PENDING_CHALLENGES_PER_DID = 10
const CLEANUP_BATCH_SIZE = 500
const nonempty = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0)
const bindingSchema = z
  .object({
    did: nonempty(2_048).refine(isValidDid),
    clientId: nonempty(2_048),
    dpopJkt: nonempty(256),
    space: nonempty(2_048).refine((value) => {
      try {
        return SpaceRef.parse(value).toString() === value
      } catch {
        return false
      }
    }),
    audience: nonempty(2_048),
  })
  .strict()
const consumeSchema = z
  .object({
    issuer: nonempty(2_048),
    jti: nonempty(256),
    expiresAt: z.number().int().positive().safe(),
    bindings: bindingSchema.extend({ nonce: nonempty(256) }),
  })
  .strict()

/** Durable, single-use challenges; construct only with configured issuer/audience. */
export class M8AssuranceStore implements M8AssuranceConsumer {
  private readonly issuer: string
  private readonly audience: string

  constructor(
    private readonly db: AccountDb,
    trust: { issuer: string; audience: string },
    private readonly now: () => Date = () => new Date(),
  ) {
    this.issuer = nonempty(2_048).parse(trust.issuer)
    this.audience = nonempty(2_048).parse(trust.audience)
  }

  /** The caller must supply bindings from authenticated OAuth/DPoP state. */
  async issue(
    input: Omit<M8AssuranceBindings, 'nonce'>,
  ): Promise<{ nonce: string; expiresAt: number }> {
    const bindings = bindingSchema.parse(input)
    if (bindings.audience !== this.audience) {
      throw new InvalidRequestError(
        'Challenge audience does not match this PDS',
        'InvalidM8Assurance',
      )
    }
    return this.db.transaction(async (tx) => {
      const now = this.currentTime()
      const { count } = await tx.db
        .selectFrom('m8_assurance_challenge')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('did', '=', bindings.did)
        .where('consumedAt', 'is', null)
        .where('expiresAt', '>', now)
        .executeTakeFirstOrThrow()
      if (count >= MAX_PENDING_CHALLENGES_PER_DID) {
        throw new InvalidRequestError(
          'Too many pending M8 challenges',
          'TooManyM8Challenges',
        )
      }
      const nonce = randomBytes(32).toString('base64url')
      const expiresAt = now + M8_ASSURANCE_MAX_LIFETIME_SEC
      await tx.db
        .insertInto('m8_assurance_challenge')
        .values({
          ...bindings,
          nonceHash: digest(nonce),
          issuer: this.issuer,
          issuedAt: now,
          expiresAt,
          consumedAt: null,
        })
        .execute()
      return { nonce, expiresAt }
    })
  }

  /** Call only after signature, lifetime and all assertion bindings are verified. */
  async consume(
    input: Parameters<M8AssuranceConsumer['consume']>[0],
  ): Promise<boolean> {
    const parsed = consumeSchema.safeParse(input)
    if (!parsed.success) return false
    const { issuer, jti, expiresAt, bindings } = parsed.data
    if (issuer !== this.issuer || bindings.audience !== this.audience)
      return false
    try {
      return await this.db.transaction(async (tx) => {
        // @NOTE recalculate inside every retry, after waiting for the DB lock.
        const now = this.currentTime()
        const retainUntil = expiresAt + M8_ASSURANCE_CLOCK_TOLERANCE_SEC
        if (
          retainUntil <= now ||
          expiresAt >
            now +
              M8_ASSURANCE_MAX_LIFETIME_SEC +
              M8_ASSURANCE_CLOCK_TOLERANCE_SEC
        )
          return false
        const updated = await tx.db
          .updateTable('m8_assurance_challenge')
          .set({ consumedAt: now })
          .where('nonceHash', '=', digest(bindings.nonce))
          .where('issuer', '=', issuer)
          .where('did', '=', bindings.did)
          .where('clientId', '=', bindings.clientId)
          .where('dpopJkt', '=', bindings.dpopJkt)
          .where('space', '=', bindings.space)
          .where('audience', '=', bindings.audience)
          .where('issuedAt', '<=', now)
          .where('expiresAt', '>', now)
          .where('consumedAt', 'is', null)
          .returning('nonceHash')
          .executeTakeFirst()
        if (!updated) return false

        const receipt = await tx.db
          .insertInto('m8_assurance_receipt')
          .values({
            issuer,
            jtiHash: digest(jti),
            consumedAt: now,
            retainUntil,
          })
          .onConflict((oc) => oc.columns(['issuer', 'jtiHash']).doNothing())
          .returning('jtiHash')
          .executeTakeFirst()
        // @NOTE throw to roll back the nonce update if another challenge spent this JTI.
        if (!receipt) throw new ConsumedAssertionError()
        return true
      })
    } catch (err) {
      if (err instanceof ConsumedAssertionError) return false
      throw err
    }
  }

  /** Bounded maintenance; retain JTI receipts through the verifier's clock tolerance. */
  async cleanupExpired(): Promise<{ challenges: number; receipts: number }> {
    return this.db.transaction(async (tx) => {
      const now = this.currentTime()
      const challenges = await tx.db
        .deleteFrom('m8_assurance_challenge')
        .where(
          'nonceHash',
          'in',
          tx.db
            .selectFrom('m8_assurance_challenge')
            .select('nonceHash')
            .where('expiresAt', '<=', now)
            .orderBy('expiresAt')
            .limit(CLEANUP_BATCH_SIZE),
        )
        .executeTakeFirst()
      // @NOTE restrict to this issuer so the bounded subquery needs only one key column.
      const receipts = await tx.db
        .deleteFrom('m8_assurance_receipt')
        .where('issuer', '=', this.issuer)
        .where(
          'jtiHash',
          'in',
          tx.db
            .selectFrom('m8_assurance_receipt')
            .select('jtiHash')
            .where('issuer', '=', this.issuer)
            .where('retainUntil', '<=', now)
            .orderBy('retainUntil')
            .limit(CLEANUP_BATCH_SIZE),
        )
        .executeTakeFirst()
      return {
        challenges: Number(challenges.numDeletedRows),
        receipts: Number(receipts.numDeletedRows),
      }
    })
  }

  private currentTime(): number {
    const value = Math.floor(this.now().getTime() / 1_000)
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('Invalid assurance store clock')
    return value
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

class ConsumedAssertionError extends Error {
  name = 'ConsumedAssertionError'
}
