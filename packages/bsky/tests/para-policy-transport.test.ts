import { randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import express from 'express'
import { exportJWK, generateKeyPair } from 'jose'
import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import {
  afterEach,
  assert,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { getDb, getMigrator } from '../../pds/src/actor-store/db/index.js'
import { ParaPolicyCheckpoint } from '../../pds/src/actor-store/para-policy/checkpoint.js'
import { ParaPolicyIntake } from '../../pds/src/actor-store/para-policy/intake.js'
import { ParaPolicyReader } from '../../pds/src/actor-store/para-policy/reader.js'
import { ParaPolicyResolver } from '../../pds/src/actor-store/para-policy/resolver.js'
import {
  PARA_POLICY_TRANSPORT_REQUEST_TYP,
  createParaPolicyTransportRouter,
  mountParaPolicyTransport,
} from '../../pds/src/para-policy-transport.js'
import { up as upOutbox } from '../src/data-plane/server/db/migrations/20260914T180000000Z-add-para-policy-outbox.js'
import { up as upCheckpointColumns } from '../src/data-plane/server/db/migrations/20260915T000000000Z-add-para-policy-checkpoint.js'
import type { PartialDB } from '../src/data-plane/server/db/tables/para-policy-outbox.js'
import { ParaPolicyDeliveryCoordinator } from '../src/para-policy/coordinator.js'
import {
  type ParaPolicyChange,
  ParaPolicyOutbox,
} from '../src/para-policy/outbox.js'
import { ParaPolicyPublisher } from '../src/para-policy/publisher.js'
import { ParaPolicyTransportClient } from '../src/para-policy/transport-client.js'

const authority = 'did:plc:ragtjsm2j2vknwkz3zp4oxrd'
const member = 'did:web:member.example'
const second = 'did:web:second.example'
const space = `at://${authority}/space/com.para.space.community/community-immutable-id`
const issuer = 'did:web:appview.para.example'
const audience = `${authority}#para_policy_transport`
const sourceUri = `at://${authority}/com.para.community.board/community-immutable-id`
const sourceCid = 'bafyreibjza57bggyhpyh4nnbkglkjetmv7nnnpb7rufpy5bky3pbmnh7am'
const collection = 'com.para.test.record'

describe('authenticated policy transport (HTTP loopback, Postgres outbox, SQLite PDS)', () => {
  let db: Kysely<PartialDB>
  let schema: string
  let actorDirectory: string
  let actorDb: ReturnType<typeof getDb>
  let reader: ParaPolicyReader
  let intake: ParaPolicyIntake
  let checkpoint: ParaPolicyCheckpoint
  let publisher: ParaPolicyPublisher
  let outbox: ParaPolicyOutbox
  let client: ParaPolicyTransportClient
  let server: { url: string; close: () => Promise<void> }
  let now: number
  let key: Awaited<ReturnType<typeof generateKeyPair>>
  let pdsKey: Awaited<ReturnType<typeof generateKeyPair>>
  const clock = () => new Date(now * 1_000)
  let pdsPublicJwk: Awaited<ReturnType<typeof exportJWK>> | null = null
  const pdsPublicX = (): string => {
    const x = (pdsPublicJwk as { x?: string } | null)?.x
    if (!x) throw new Error('PDS public key not exported yet')
    return x
  }
  const config = {
    issuer,
    audience,
    space,
    sourceUri,
    kid: 'publisher-1',
    lifetimeSec: 300,
  }

  function connect() {
    const pool = new pg.Pool({
      connectionString:
        process.env.DB_POSTGRES_URL ??
        'postgresql://pg:password@127.0.0.1:5433/postgres',
      max: 4,
      // @NOTE match AppView's INT8-to-number parser without altering other test pools.
      types: {
        getTypeParser: (oid, format) =>
          oid === 20 ? Number : pg.types.getTypeParser(oid, format),
      },
    })
    return new Kysely<PartialDB>({
      dialect: new PostgresDialect({ pool }),
    }).withSchema(schema)
  }

  beforeAll(async () => {
    key = await generateKeyPair('EdDSA')
    pdsKey = await generateKeyPair('EdDSA')
  })

  beforeEach(async () => {
    schema = `transport_${randomBytes(8).toString('hex')}`
    db = connect()
    await db.schema.createSchema(schema).execute()
    await upOutbox(db as never)
    await upCheckpointColumns(db as never)
    actorDirectory = await mkdtemp(path.join(tmpdir(), 'watzappa-transport-'))
    actorDb = getDb(path.join(actorDirectory, 'actor.sqlite'))
    await getMigrator(actorDb).migrateToLatestOrThrow()
    now = Math.floor(Date.now() / 1_000)
    await actorDb.db
      .insertInto('space')
      .values({
        uri: space,
        authority,
        type: 'com.para.space.community',
        createdAt: clock().toISOString(),
        deletedAt: null,
      })
      .execute()
    publisher = await ParaPolicyPublisher.create(config, key.privateKey, clock)
    outbox = makeOutbox()
    reader = new ParaPolicyReader(actorDb)
    intake = new ParaPolicyIntake(
      actorDb,
      authority,
      {
        ...publisher.getBindings(),
        jwks: publisher.getJwks(),
        allowBootstrap: true,
        maxAssertionAgeSec: 300,
      },
      clock,
    )
    checkpoint = new ParaPolicyCheckpoint(
      actorDb,
      authority,
      {
        ...publisher.getBindings(),
        jwks: publisher.getJwks(),
        maxAssertionAgeSec: 300,
        challengeLifetimeSec: 300,
      },
      clock,
    )
    pdsPublicJwk = await exportJWK(pdsKey.publicKey)
    server = await startTransport({
      pdsDid: authority,
      audience,
      issuer,
      jwks: publisher.getJwks(),
      kid: 'pds-transport-1',
      privateKey: pdsKey.privateKey,
      maxRequestBytes: 20_000,
      maxAgeSec: 60,
    })
    client = new ParaPolicyTransportClient(
      {
        serviceUrl: server.url,
        issuer,
        audience,
        kid: 'publisher-1',
        privateKey: key.privateKey,
        pdsDid: authority,
        jwks: {
          keys: [
            {
              kty: 'OKP',
              crv: 'Ed25519',
              x: pdsPublicX(),
              kid: 'pds-transport-1',
            },
          ],
        },
        maxAgeSec: 60,
      },
      clock,
    )
  })

  afterEach(async () => {
    await db.schema.dropSchema(schema).cascade().execute()
    await db.destroy()
    await actorDb.db.destroy()
    await rm(actorDirectory, { recursive: true, force: true })
    await server.close()
  })

  function makeOutbox(connection = db) {
    return new ParaPolicyOutbox(
      connection.$pickTables<keyof PartialDB>(),
      publisher,
      clock,
    )
  }
  function change(overrides: Partial<ParaPolicyChange> = {}): ParaPolicyChange {
    return {
      kind: 'snapshot',
      sourceCid,
      members: [
        { did: member, membershipState: 'active', roles: ['moderator'] },
      ],
      ...overrides,
    }
  }
  function enqueue(eventId: string, input = change()) {
    return db
      .transaction()
      .execute((tx) => makeOutbox(tx).enqueue(eventId, input))
  }
  async function stream() {
    return db
      .selectFrom('para_policy_publication')
      .selectAll()
      .where('space', '=', space)
      .executeTakeFirstOrThrow()
  }
  function makeCoordinator(checkpointChange = change()) {
    return new ParaPolicyDeliveryCoordinator({
      outbox,
      client,
      prepareCheckpoint: (eventId, challenge) =>
        db
          .transaction()
          .execute((tx) =>
            makeOutbox(tx).prepareCheckpoint(
              eventId,
              challenge,
              checkpointChange,
            ),
          ),
    })
  }
  async function startTransport(
    serverConfig: Parameters<typeof createParaPolicyTransportRouter>[3],
  ) {
    const router = createParaPolicyTransportRouter(
      actorDb,
      intake,
      checkpoint,
      serverConfig,
      clock,
    )
    const app = express()
    mountParaPolicyTransport(app, router)
    const listening = await new Promise<{
      url: string
      close: () => Promise<void>
    }>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => {
        const address = instance.address()
        assert(typeof address === 'object' && address)
        resolve({
          url: `http://127.0.0.1:${address.port}/internal/para-policy/`,
          close: () =>
            new Promise<void>((res, rej) =>
              instance.close((err) => (err ? rej(err) : res())),
            ),
        })
      })
      instance.once('error', reject)
    })
    return listening
  }
  async function decision(principal: string, policyEpoch: number) {
    const resolver = new ParaPolicyResolver(
      [
        {
          space,
          collection,
          action: 'create',
          clientIds: ['client'],
          roles: ['moderator'],
        },
      ],
      600_000,
    )
    const input = await actorDb.transaction((tx) =>
      new ParaPolicyReader(tx).getPolicyInput(space, principal),
    )
    return resolver.resolve(
      {
        space,
        principalDid: principal,
        collection,
        action: 'create',
        clientId: 'client',
        policyEpoch,
        now: Math.max(Date.now(), clock().getTime()),
      },
      input,
    )
  }

  it('delivers an ordered update over HTTP and acknowledges on the signed receipt', async () => {
    const first = await enqueue('bootstrap')
    const delivery = makeCoordinator()
    expect(await delivery.deliverNextUpdate()).toBe('delivered')
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: first.sourceVersion,
      projectionDigest: first.projectionDigest,
    })
    expect(await stream()).toMatchObject({
      deliveryStatus: 'ready',
      acknowledgedVersion: first.sourceVersion,
    })
    expect(await delivery.deliverNextUpdate()).toBe('empty')
  })

  it('recovers a lost revocation end to end over the transport', async () => {
    await enqueue('bootstrap')
    assert((await makeCoordinator().deliverNextUpdate()) === 'delivered')
    now += 5
    await enqueue(
      'lost-revocation',
      change({
        kind: 'patch',
        members: [{ did: member, membershipState: 'removed' }],
      }),
    )
    await enqueue(
      'arrives-late',
      change({
        kind: 'patch',
        members: [{ did: second, membershipState: 'active' }],
      }),
    )
    // @NOTE out-of-order arrival latches the receiver stale.
    const arrived = await db
      .selectFrom('para_policy_outbox')
      .selectAll()
      .where('space', '=', space)
      .where('sourceVersion', '=', 3)
      .executeTakeFirstOrThrow()
    await expect(intake.ingest(arrived.assertion)).rejects.toMatchObject({
      error: 'PolicyProjectionOutOfOrder',
    })
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'stale',
    })

    const status = await makeCoordinator({
      kind: 'snapshot',
      sourceCid,
      members: [
        { did: second, membershipState: 'active', roles: ['moderator'] },
      ],
    }).recoverWithCheckpoint('recovery-1')
    expect(status).toBe('recovered')
    expect(await reader.getPolicyState(space)).toMatchObject({
      projectionStatus: 'ready',
      sourceVersion: 4,
    })
    expect(await decision(member, 4)).toMatchObject({
      allowed: false,
      denial: 'not-active-member',
    })
    expect(await decision(second, 4)).toMatchObject({ allowed: true })
    expect(await stream()).toMatchObject({
      deliveryStatus: 'ready',
      acknowledgedVersion: 4,
    })
    expect(await client.checkpointReceipt()).toMatchObject({
      sourceVersion: 4,
    })
  })

  it('rejects responses not signed by the pinned PDS key', async () => {
    await enqueue('bootstrap')
    const attacker = await generateKeyPair('EdDSA')
    await server.close()
    server = await startTransport({
      pdsDid: authority,
      audience,
      issuer,
      jwks: publisher.getJwks(),
      kid: 'pds-transport-1',
      privateKey: attacker.privateKey,
      maxRequestBytes: 20_000,
      maxAgeSec: 60,
    })
    client = new ParaPolicyTransportClient(
      {
        serviceUrl: server.url,
        issuer,
        audience,
        kid: 'publisher-1',
        privateKey: key.privateKey,
        pdsDid: authority,
        jwks: {
          keys: [
            {
              kty: 'OKP',
              crv: 'Ed25519',
              x: pdsPublicX(),
              kid: 'pds-transport-1',
            },
          ],
        },
        maxAgeSec: 60,
      },
      clock,
    )
    await expect(client.issueChallenge()).rejects.toMatchObject({
      code: 'InvalidResponseSignature',
    })
    // @NOTE a "ready" from the wrong identity never reaches the outbox.
    expect(await stream()).toMatchObject({ acknowledgedVersion: 0 })
  })

  it('rejects a response replayed for a different request', async () => {
    await enqueue('bootstrap')
    // @NOTE capture one signed response, then submit it as the answer to
    // another request by replaying the raw token through a stub server.
    const captured = await captureResponseToken()
    await server.close()
    const stub = express()
    stub.post('/internal/para-policy/', (_req, res) => {
      res.status(200).type('application/jwt').send(captured)
    })
    // @NOTE the stub replaces the tracked server so teardown closes it once.
    server = await listen(stub)
    const replayClient = new ParaPolicyTransportClient(
      {
        serviceUrl: server.url,
        issuer,
        audience,
        kid: 'publisher-1',
        privateKey: key.privateKey,
        pdsDid: authority,
        jwks: {
          keys: [
            {
              kty: 'OKP',
              crv: 'Ed25519',
              x: pdsPublicX(),
              kid: 'pds-transport-1',
            },
          ],
        },
        maxAgeSec: 60,
      },
      clock,
    )
    await expect(replayClient.issueChallenge()).rejects.toMatchObject({
      code: 'ResponseNotBound',
    })
  })

  it('refuses unauthenticated, expired and replayed requests', async () => {
    const rogue = await generateKeyPair('EdDSA')
    const rogueClient = new ParaPolicyTransportClient(
      {
        serviceUrl: server.url,
        issuer,
        audience,
        kid: 'publisher-1',
        privateKey: rogue.privateKey,
        pdsDid: authority,
        jwks: {
          keys: [
            {
              kty: 'OKP',
              crv: 'Ed25519',
              x: pdsPublicX(),
              kid: 'pds-transport-1',
            },
          ],
        },
        maxAgeSec: 60,
      },
      clock,
    )
    await expect(rogueClient.issueChallenge()).rejects.toMatchObject({
      status: 401,
    })
    // @NOTE expired envelope: signed by a client whose clock is stale.
    const staleClock = () => new Date((now - 61) * 1_000)
    const staleClient = new ParaPolicyTransportClient(
      {
        serviceUrl: server.url,
        issuer,
        audience,
        kid: 'publisher-1',
        privateKey: key.privateKey,
        pdsDid: authority,
        jwks: {
          keys: [
            {
              kty: 'OKP',
              crv: 'Ed25519',
              x: pdsPublicX(),
              kid: 'pds-transport-1',
            },
          ],
        },
        maxAgeSec: 60,
      },
      staleClock,
    )
    await expect(staleClient.issueChallenge()).rejects.toMatchObject({
      status: 401,
    })
  })

  it('rejects a replayed request identifier', async () => {
    const token = await signedRequestToken('accepted-receipt')
    const first = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/jwt' },
      body: token,
    })
    expect(first.status).toBe(200)
    const replay = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/jwt' },
      body: token,
    })
    expect(replay.status).toBe(409)
    await expect(replay.json()).resolves.toMatchObject({
      error: 'RequestReplayed',
    })
  })

  it('rejects oversized delivery attempts boundedly', async () => {
    const big = 'x'.repeat(16_385)
    await expect(client.deliverDelta(big)).rejects.toMatchObject({
      status: 413,
      code: 'RequestTooLarge',
    })
    expect(await reader.getPolicyState(space)).toBeNull()
    expect(
      await actorDb.db
        .selectFrom('para_policy_transport_receipt')
        .selectAll()
        .execute(),
    ).toHaveLength(0)
  })

  it('reconciles a lost checkpoint confirmation over HTTP', async () => {
    await enqueue('bootstrap')
    assert((await makeCoordinator().deliverNextUpdate()) === 'delivered')
    await enqueue(
      'lost-revocation',
      change({
        kind: 'patch',
        members: [{ did: member, membershipState: 'removed' }],
      }),
    )
    await enqueue(
      'arrives-late',
      change({
        kind: 'patch',
        members: [{ did: second, membershipState: 'active' }],
      }),
    )
    const arrived = await db
      .selectFrom('para_policy_outbox')
      .selectAll()
      .where('space', '=', space)
      .where('sourceVersion', '=', 3)
      .executeTakeFirstOrThrow()
    await expect(intake.ingest(arrived.assertion)).rejects.toMatchObject({
      error: 'PolicyProjectionOutOfOrder',
    })

    const challenge = await client.issueChallenge()
    assert(challenge)
    const prepared = await db.transaction().execute((tx) =>
      makeOutbox(tx).prepareCheckpoint('recovery-1', challenge, {
        kind: 'snapshot',
        sourceCid,
        members: [
          { did: second, membershipState: 'active', roles: ['moderator'] },
        ],
      }),
    )
    const claim = await outbox.claimCheckpoint()
    assert(claim.status === 'claimed')
    const receipt = await client.deliverCheckpoint(claim.update.assertion)
    expect(receipt).toMatchObject({ sourceVersion: 4 })
    // @NOTE the confirmation response is lost; redelivery is refused because
    // the challenge is spent, and reconciliation completes over HTTP.
    await expect(
      client.deliverCheckpoint(claim.update.assertion),
    ).rejects.toMatchObject({ code: 'CheckpointChallengeConsumed' })
    expect(await stream()).toMatchObject({
      deliveryStatus: 'checkpoint-pending',
    })
    const persisted = await client.checkpointReceipt()
    assert(persisted)
    expect(await outbox.reconcileCheckpoint(persisted as never)).toBe(true)
    expect(await stream()).toMatchObject({
      deliveryStatus: 'ready',
      acknowledgedVersion: 4,
    })
    expect(prepared.sourceVersion).toBe(4)
  })

  it('reports nothing to recover for a healthy receiver', async () => {
    await enqueue('bootstrap')
    assert((await makeCoordinator().deliverNextUpdate()) === 'delivered')
    expect(await makeCoordinator().recoverWithCheckpoint('recovery-1')).toBe(
      'nothing-to-recover',
    )
    expect(await stream()).toMatchObject({ deliveryStatus: 'ready' })
  })

  async function signedRequestToken(op: string): Promise<string> {
    const { SignJWT } = await import('jose')
    const iat = Math.floor(clock().getTime() / 1_000)
    return new SignJWT({
      iss: issuer,
      aud: audience,
      iat,
      exp: iat + 60,
      jti: randomBytes(16).toString('base64url'),
      op,
    })
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: PARA_POLICY_TRANSPORT_REQUEST_TYP,
        kid: 'publisher-1',
      })
      .sign(key.privateKey)
  }

  async function captureResponseToken(): Promise<string> {
    const raw = await fetch(server.url, {
      method: 'POST',
      headers: { 'content-type': 'application/jwt' },
      body: await signedRequestToken('accepted-receipt'),
    })
    expect(raw.status).toBe(200)
    return raw.text()
  }

  async function listen(app: express.Express) {
    const listening = await new Promise<{
      url: string
      close: () => Promise<void>
    }>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => {
        const address = instance.address()
        assert(typeof address === 'object' && address)
        resolve({
          url: `http://127.0.0.1:${address.port}/internal/para-policy/`,
          close: () =>
            new Promise<void>((res, rej) =>
              instance.close((err) => (err ? rej(err) : res())),
            ),
        })
      })
      instance.once('error', reject)
    })
    return listening
  }
})
