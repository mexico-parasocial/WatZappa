import { createHash, randomBytes } from 'node:crypto'
import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type Response,
  Router,
} from 'express'
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
import type { ActorDb } from './actor-store/db/index.js'
import type { ParaPolicyCheckpoint } from './actor-store/para-policy/checkpoint.js'
import type { ParaPolicyIntake } from './actor-store/para-policy/intake.js'

export const PARA_POLICY_TRANSPORT_REQUEST_TYP =
  'application/para-policy-transport-request+jwt'
export const PARA_POLICY_TRANSPORT_RESPONSE_TYP =
  'application/para-policy-transport-response+jwt'

const MAX_ASSERTION_LENGTH = 16_384
const MAX_ENVELOPE_LIFETIME_SEC = 120
const RETENTION_GRACE_SEC = 60
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
const requestHeaderSchema = z
  .object({
    alg: z.literal('EdDSA'),
    typ: z.literal(PARA_POLICY_TRANSPORT_REQUEST_TYP),
    kid: z.string().min(1).max(256),
  })
  .strict()
const requestClaimsSchema = z
  .object({
    iss: z.string(),
    aud: z.string(),
    iat: z.number().int().nonnegative().safe(),
    exp: z.number().int().positive().safe(),
    jti: z.string().min(1).max(256),
    op: z.enum([
      'issue-challenge',
      'deliver-delta',
      'deliver-checkpoint',
      'checkpoint-receipt',
      'accepted-receipt',
    ]),
    assertion: z.string().min(1).max(MAX_ASSERTION_LENGTH).optional(),
  })
  .strict()
  .superRefine((claims, ctx) => {
    const requiresAssertion =
      claims.op === 'deliver-delta' || claims.op === 'deliver-checkpoint'
    if (requiresAssertion && claims.assertion === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${claims.op} requires an assertion`,
        path: ['assertion'],
      })
    }
  })

/** Operator-supplied trust for the authenticated policy transport. */
export type ParaPolicyTransportConfig = {
  /** This PDS's DID: signs every response and receives every request. */
  pdsDid: string
  /** Exact audience requests must carry (e.g. `${pdsDid}#para_policy_transport`). */
  audience: string
  /** The only authorized caller: the publisher's issuer DID. */
  issuer: string
  /** Pinned publisher verification keys; rotations update this config. */
  jwks: JSONWebKeySet
  /** This PDS's response-signing key id. */
  kid: string
  /** This PDS's response-signing Ed25519 private key. Never persisted here. */
  privateKey: KeyLike
  /** Bounded request body size; larger delivery attempts are rejected outright. */
  maxRequestBytes: number
  /** Maximum envelope lifetime; freshness is enforced without clock tolerance. */
  maxAgeSec: number
}

export class ParaPolicyTransportError extends Error {
  name = 'ParaPolicyTransportError'
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code)
  }
}

/**
 * Standalone authenticated transport between the AppView policy worker and
 * this PDS. Nothing constructs this router outside tests: production wiring
 * will mount it behind an off-by-default configuration flag when a delivery
 * worker exists. Requests are signed by the pinned publisher identity and
 * single-use; responses are signed by this PDS and bound to the request
 * identifier, so the caller can authenticate the receiver before trusting
 * any receipt.
 */
export function createParaPolicyTransportRouter(
  db: ActorDb,
  intake: ParaPolicyIntake,
  checkpoint: ParaPolicyCheckpoint,
  config: ParaPolicyTransportConfig,
  now: () => Date = () => new Date(),
): Router {
  if (
    !isValidDid(config.pdsDid) ||
    !config.audience?.trim() ||
    !isValidDid(config.issuer) ||
    !config.kid?.trim() ||
    config.kid.length > 256 ||
    !Number.isSafeInteger(config.maxRequestBytes) ||
    config.maxRequestBytes <= 0 ||
    !Number.isSafeInteger(config.maxAgeSec) ||
    config.maxAgeSec <= 0 ||
    config.maxAgeSec > MAX_ENVELOPE_LIFETIME_SEC
  ) {
    throw new Error('Invalid PARA policy transport configuration')
  }
  const keys = z.array(keySchema).min(1).max(16).parse(config.jwks.keys)
  if (new Set(keys.map((key) => key.kid)).size !== keys.length) {
    throw new Error('PARA policy transport key IDs must be unique')
  }
  const verifyKey = createLocalJWKSet({ keys })

  const router = Router()
  router.post(
    '/',
    express.text({
      type: 'application/jwt',
      limit: config.maxRequestBytes,
    }),
    wrap(async (req, res) => {
      const token = typeof req.body === 'string' ? req.body : ''
      const claims = await verifyRequest(token)
      await consumeRequestIdentifier(claims)
      const body = await dispatch(claims)
      await sendResponse(claims, res, body)
    }),
  )
  const onTransportError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      res.status(413).json({ error: 'RequestTooLarge' })
      return
    }
    res.status(500).json({ error: 'InternalError' })
  }
  router.use(onTransportError)
  return router

  async function verifyRequest(token: string) {
    if (!token) throw new ParaPolicyTransportError(401, 'UnauthorizedTransport')
    let payload: unknown
    try {
      requestHeaderSchema.parse(decodeProtectedHeader(token))
      payload = (
        await jwtVerify(token, verifyKey, {
          algorithms: ['EdDSA'],
          typ: PARA_POLICY_TRANSPORT_REQUEST_TYP,
          issuer: config.issuer,
          audience: config.audience,
          requiredClaims: ['iss', 'aud', 'iat', 'exp', 'jti', 'op'],
          currentDate: now(),
        })
      ).payload
    } catch {
      throw new ParaPolicyTransportError(401, 'UnauthorizedTransport')
    }
    const parsed = requestClaimsSchema.safeParse(payload)
    if (!parsed.success) {
      throw new ParaPolicyTransportError(401, 'UnauthorizedTransport')
    }
    const current = Math.floor(now().getTime() / 1_000)
    if (
      !Number.isSafeInteger(current) ||
      parsed.data.iat > current ||
      parsed.data.exp <= current ||
      parsed.data.exp <= parsed.data.iat ||
      parsed.data.exp - parsed.data.iat > config.maxAgeSec ||
      current - parsed.data.iat >= config.maxAgeSec
    ) {
      throw new ParaPolicyTransportError(401, 'UnauthorizedTransport')
    }
    return parsed.data
  }

  async function consumeRequestIdentifier(
    claims: z.infer<typeof requestClaimsSchema>,
  ): Promise<void> {
    const current = now().toISOString()
    const retainUntil = new Date(
      now().getTime() + (claims.exp - claims.iat + RETENTION_GRACE_SEC) * 1_000,
    ).toISOString()
    await db.transaction(async (tx) => {
      await tx.db
        .deleteFrom('para_policy_transport_receipt')
        .where(
          'jtiHash',
          'in',
          tx.db
            .selectFrom('para_policy_transport_receipt')
            .select('jtiHash')
            .where('issuer', '=', claims.iss)
            .where('retainUntil', '<=', current)
            .orderBy('retainUntil')
            .limit(CLEANUP_BATCH_SIZE),
        )
        .execute()
      const inserted = await tx.db
        .insertInto('para_policy_transport_receipt')
        .values({
          issuer: claims.iss,
          jtiHash: digest(claims.jti),
          consumedAt: current,
          retainUntil,
        })
        .onConflict((oc) => oc.columns(['issuer', 'jtiHash']).doNothing())
        .returning('jtiHash')
        .executeTakeFirst()
      if (!inserted) {
        throw new ParaPolicyTransportError(409, 'RequestReplayed')
      }
    })
  }

  async function dispatch(
    claims: z.infer<typeof requestClaimsSchema>,
  ): Promise<unknown> {
    if (claims.op === 'issue-challenge') {
      return { challenge: await checkpoint.issueChallenge() }
    }
    if (claims.op === 'checkpoint-receipt') {
      return { receipt: await checkpoint.getCheckpointReceipt() }
    }
    if (claims.op === 'accepted-receipt') {
      return { receipt: await intake.getAcceptedReceipt() }
    }
    try {
      if (claims.op === 'deliver-delta') {
        await intake.ingest(claims.assertion!)
        return { receipt: await intake.getAcceptedReceipt() }
      }
      return { receipt: await checkpoint.install(claims.assertion!) }
    } catch (error) {
      throw transportError(error)
    }
  }

  async function sendResponse(
    claims: z.infer<typeof requestClaimsSchema>,
    res: Response,
    body: unknown,
  ): Promise<void> {
    const iat = Math.floor(now().getTime() / 1_000)
    const response = await new SignJWT({
      iss: config.pdsDid,
      aud: claims.iss,
      iat,
      exp: iat + config.maxAgeSec,
      jti: randomBytes(16).toString('base64url'),
      req: claims.jti,
      body,
    })
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: PARA_POLICY_TRANSPORT_RESPONSE_TYP,
        kid: config.kid,
      })
      .sign(config.privateKey)
    res.status(200).type('application/jwt').send(response)
  }
}

function transportError(error: unknown): ParaPolicyTransportError {
  if (error instanceof ParaPolicyTransportError) return error
  const code =
    typeof error === 'object' && error && 'error' in error
      ? String((error as { error: unknown }).error)
      : 'InvalidRequest'
  const conflict = new Set([
    'PolicyProjectionOutOfOrder',
    'PolicyProjectionChainMismatch',
    'PolicyProjectionEpochRollback',
    'PolicyProjectionRebootstrapRequired',
    'PolicyProjectionSourceMismatch',
    'CheckpointChallengeConsumed',
    'CheckpointChallengeExpired',
    'CheckpointStateAdvanced',
  ])
  if (conflict.has(code)) return new ParaPolicyTransportError(409, code)
  if (code === 'RequestReplayed') {
    return new ParaPolicyTransportError(409, code)
  }
  return new ParaPolicyTransportError(400, code)
}

function wrap(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => void {
  return (req, res) => {
    handler(req, res).catch((error) => {
      if (error instanceof ParaPolicyTransportError) {
        res.status(error.status).json({ error: error.code })
        return
      }
      res.status(500).json({ error: 'InternalError' })
    })
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Mount helper for tests and the future flagged production wiring. */
export function mountParaPolicyTransport(app: Express, router: Router): void {
  app.use('/internal/para-policy', router)
}
