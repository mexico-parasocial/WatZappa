import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sql } from 'kysely'
import {
  type AccountDb,
  getDb,
  getMigrator,
} from '../src/account-manager/db/index.js'
import { M8AssuranceStore } from '../src/account-manager/m8-assurance-store.js'
import {
  type M8AssuranceBindings,
  M8AssuranceVerifier,
} from '../src/m8-assurance-verifier.js'
import {
  FIXTURE_NOW_SEC,
  M8_AUDIENCE,
  M8_CLIENT_ID,
  M8_DPOP_JKT,
  M8_ISSUER,
  M8_NONCE,
  M8_SPACE,
  PDS_DID,
  m8AssuranceVectors as vectors,
  primaryJwks,
} from './fixtures/m8-assurance-v1.js'

const bindings: Omit<M8AssuranceBindings, 'nonce'> = {
  did: PDS_DID,
  clientId: M8_CLIENT_ID,
  dpopJkt: M8_DPOP_JKT,
  space: M8_SPACE,
  audience: M8_AUDIENCE,
}
const trust = { issuer: M8_ISSUER, audience: M8_AUDIENCE }

describe('durable M8 assurance challenges', () => {
  let directory: string
  let location: string
  let db: AccountDb
  let peer: AccountDb
  let store: M8AssuranceStore
  let peerStore: M8AssuranceStore
  let now: number
  const clock = () => new Date(now * 1_000)

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'watzappa-m8-store-'))
    location = path.join(directory, 'account.sqlite')
    db = getDb(location)
    await getMigrator(db).migrateToLatestOrThrow()
    await db.ensureWal()
    peer = getDb(location)
    now = FIXTURE_NOW_SEC
    store = new M8AssuranceStore(db, trust, clock)
    peerStore = new M8AssuranceStore(peer, trust, clock)
  })

  afterEach(async () => {
    await Promise.all([db.db.destroy(), peer.db.destroy()])
    await rm(directory, { recursive: true, force: true })
  })

  function assertion(nonce: string, jti = 'assertion-one') {
    return {
      issuer: M8_ISSUER,
      jti,
      expiresAt: now + 60,
      bindings: { ...bindings, nonce },
    }
  }

  it('round-trips migration 011 without changing existing account data', async () => {
    await db.db
      .insertInto('account')
      .values({
        did: PDS_DID,
        email: 'existing@example.test',
        passwordScrypt: 'existing-hash',
        emailConfirmedAt: null,
        invitesDisabled: 0,
      })
      .execute()
    const original = await db.db.selectFrom('account').selectAll().execute()
    await getMigrator(db).migrateToOrThrow('010')
    await expect(store.issue(bindings)).rejects.toMatchObject({
      message: expect.stringContaining('no such table'),
    })
    await getMigrator(db).migrateToLatestOrThrow()
    expect(await db.db.selectFrom('account').selectAll().execute()).toEqual(
      original,
    )
    const { nonce } = await store.issue(bindings)
    expect(await store.consume(assertion(nonce))).toBe(true)
  })

  it('issues random fully bound challenges and stores only nonce/JTI hashes', async () => {
    const first = await store.issue(bindings)
    const second = await store.issue(bindings)
    expect(first.nonce).toMatch(/^[\w-]{43}$/)
    expect(second.nonce).not.toBe(first.nonce)
    expect(first.expiresAt).toBe(now + 60)
    expect(await store.consume(assertion(first.nonce))).toBe(true)
    const rows = await db.db
      .selectFrom('m8_assurance_challenge')
      .selectAll()
      .execute()
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.nonceHash === digest(first.nonce))).toEqual({
      ...bindings,
      issuer: M8_ISSUER,
      nonceHash: digest(first.nonce),
      issuedAt: now,
      expiresAt: now + 60,
      consumedAt: now,
    })
    const receipts = await db.db
      .selectFrom('m8_assurance_receipt')
      .selectAll()
      .execute()
    expect(receipts).toEqual([
      {
        issuer: M8_ISSUER,
        jtiHash: digest('assertion-one'),
        consumedAt: now,
        retainUntil: now + 65,
      },
    ])
    expect(JSON.stringify({ rows, receipts })).not.toContain(first.nonce)
    expect(JSON.stringify({ rows, receipts })).not.toContain('assertion-one')
  })

  it.each([
    ['did', 'did:plc:7zp4oxrdragtjsm2j2vknwkz'],
    ['clientId', 'https://other.example/metadata.json'],
    ['dpopJkt', 'other-key'],
    ['space', `${M8_SPACE}-other`],
    ['audience', `${M8_AUDIENCE}-other`],
    ['nonce', 'unknown-nonce'],
  ])(
    'rejects mismatched %s without spending the nonce or JTI',
    async (key, value) => {
      const { nonce } = await store.issue(bindings)
      const valid = assertion(nonce)
      expect(
        await store.consume({
          ...valid,
          bindings: { ...valid.bindings, [key]: value },
        }),
      ).toBe(false)
      expect(await store.consume(valid)).toBe(true)
    },
  )

  it('rejects an untrusted issuer without spending the nonce or JTI', async () => {
    const { nonce } = await store.issue(bindings)
    const valid = assertion(nonce)
    expect(
      await store.consume({ ...valid, issuer: 'did:web:untrusted.example' }),
    ).toBe(false)
    expect(await store.consume(valid)).toBe(true)
  })

  it('allows only one concurrent consumer of the same nonce across connections', async () => {
    const { nonce } = await store.issue(bindings)
    const result = await Promise.all([
      store.consume(assertion(nonce)),
      peerStore.consume(assertion(nonce, 'another-jti')),
    ])
    expect(result.sort()).toEqual([false, true])
    expect(
      await db.db.selectFrom('m8_assurance_receipt').selectAll().execute(),
    ).toHaveLength(1)
  })

  it('allows only one concurrent use of a JTI and rolls back the losing nonce', async () => {
    const first = await store.issue(bindings)
    const second = await store.issue(bindings)
    const result = await Promise.all([
      store.consume(assertion(first.nonce)),
      peerStore.consume(assertion(second.nonce)),
    ])
    expect([...result].sort()).toEqual([false, true])
    const loser = result[0] ? second : first
    expect(await store.consume(assertion(loser.nonce, 'fresh-jti'))).toBe(true)
  })

  it('retains spent nonces and JTIs after closing and reopening the database', async () => {
    const first = await store.issue(bindings)
    const second = await store.issue(bindings)
    expect(await store.consume(assertion(first.nonce))).toBe(true)
    await Promise.all([db.db.destroy(), peer.db.destroy()])
    db = getDb(location)
    peer = getDb(location)
    store = new M8AssuranceStore(db, trust, clock)
    expect(await store.consume(assertion(first.nonce, 'fresh-jti'))).toBe(false)
    expect(await store.consume(assertion(second.nonce))).toBe(false)
    expect(await store.consume(assertion(second.nonce, 'fresh-jti'))).toBe(true)
  })

  it('rolls back nonce consumption on an unexpected receipt-write failure', async () => {
    const { nonce } = await store.issue(bindings)
    await sql`create trigger reject_m8_receipt before insert on m8_assurance_receipt
      begin select raise(abort, 'forced receipt failure'); end`.execute(db.db)
    await expect(store.consume(assertion(nonce))).rejects.toMatchObject({
      message: 'forced receipt failure',
    })
    await sql`drop trigger reject_m8_receipt`.execute(db.db)
    expect(await store.consume(assertion(nonce))).toBe(true)
  })

  it('expires PDS challenges exactly at their deadline, without clock tolerance', async () => {
    const { nonce, expiresAt } = await store.issue(bindings)
    now = expiresAt
    expect(await store.consume(assertion(nonce))).toBe(false)
  })

  it('rejects a challenge used before its PDS issuance time', async () => {
    const { nonce } = await store.issue(bindings)
    now -= 1
    expect(await store.consume(assertion(nonce))).toBe(false)
    now += 1
    expect(await store.consume(assertion(nonce))).toBe(true)
  })

  it('honors assertion clock tolerance but rejects at its exact boundary', async () => {
    const first = await store.issue(bindings)
    const second = await store.issue(bindings)
    expect(
      await store.consume({ ...assertion(first.nonce), expiresAt: now - 4 }),
    ).toBe(true)
    expect(
      await store.consume({ ...assertion(second.nonce), expiresAt: now - 5 }),
    ).toBe(false)
    expect(await store.consume(assertion(second.nonce, 'fresh-jti'))).toBe(true)
  })

  it('retains receipts through skew and cannot revive an expired assertion after cleanup', async () => {
    const { nonce } = await store.issue(bindings)
    const original = assertion(nonce)
    expect(await store.consume(original)).toBe(true)
    now += 60
    expect(await store.cleanupExpired()).toEqual({ challenges: 1, receipts: 0 })
    now += 4
    expect(await store.cleanupExpired()).toEqual({ challenges: 0, receipts: 0 })
    now += 1
    expect(await store.cleanupExpired()).toEqual({ challenges: 0, receipts: 1 })
    const fresh = await store.issue(bindings)
    expect(
      await store.consume({
        ...original,
        bindings: { ...bindings, nonce: fresh.nonce },
      }),
    ).toBe(false)
    expect(await store.consume(assertion(fresh.nonce, 'fresh-jti'))).toBe(true)
  })

  it('caps pending challenges per DID and frees slots at expiry', async () => {
    for (let i = 0; i < 10; i++) await store.issue(bindings)
    await expect(store.issue(bindings)).rejects.toMatchObject({
      error: 'TooManyM8Challenges',
    })
    await expect(peerStore.issue(bindings)).rejects.toMatchObject({
      error: 'TooManyM8Challenges',
    })
    await expect(
      store.issue({ ...bindings, did: 'did:plc:7zp4oxrdragtjsm2j2vknwkz' }),
    ).resolves.toBeDefined()
    now += 60
    await expect(store.issue(bindings)).resolves.toBeDefined()
  })

  it('enforces the pending cap under concurrent issuance across connections', async () => {
    for (let i = 0; i < 9; i++) await store.issue(bindings)
    const results = await Promise.allSettled([
      store.issue(bindings),
      peerStore.issue(bindings),
    ])
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ error: 'TooManyM8Challenges' }),
      }),
    ])
  })

  it('bounds cleanup batches and preserves other issuers and unexpired state', async () => {
    const expired = Array.from({ length: 501 }, (_, index) => ({
      ...bindings,
      issuer: M8_ISSUER,
      nonceHash: digest(`nonce-${index}`),
      issuedAt: now - 60,
      expiresAt: now,
      consumedAt: now - 30,
    }))
    await db.db.insertInto('m8_assurance_challenge').values(expired).execute()
    await db.db
      .insertInto('m8_assurance_receipt')
      .values(
        expired.map((_, index) => ({
          issuer: M8_ISSUER,
          jtiHash: digest(`jti-${index}`),
          consumedAt: now - 30,
          retainUntil: now,
        })),
      )
      .execute()
    await db.db
      .insertInto('m8_assurance_receipt')
      .values({
        issuer: 'did:web:other.example',
        jtiHash: digest('jti-0'),
        consumedAt: now - 30,
        retainUntil: now,
      })
      .execute()
    const live = await store.issue(bindings)
    expect(await store.cleanupExpired()).toEqual({
      challenges: 500,
      receipts: 500,
    })
    expect(await store.cleanupExpired()).toEqual({ challenges: 1, receipts: 1 })
    expect(await store.cleanupExpired()).toEqual({ challenges: 0, receipts: 0 })
    expect(
      await db.db.selectFrom('m8_assurance_receipt').select('issuer').execute(),
    ).toEqual([{ issuer: 'did:web:other.example' }])
    expect(await store.consume(assertion(live.nonce))).toBe(true)
  })

  it('rejects malformed or overlong assertions without spending valid challenges', async () => {
    const { nonce } = await store.issue(bindings)
    for (const invalid of [
      { ...assertion(nonce), jti: '' },
      { ...assertion(nonce), expiresAt: now + 66 },
      { ...assertion(nonce), expiresAt: Number.NaN },
      {
        ...assertion(nonce),
        bindings: { ...bindings, nonce, space: 'not-a-space' },
      },
    ])
      expect(await store.consume(invalid)).toBe(false)
    await expect(
      store.issue({ ...bindings, audience: 'wrong-pds' }),
    ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
    await expect(store.issue({ ...bindings, did: '' })).rejects.toThrow()
    expect(await store.consume(assertion(nonce))).toBe(true)
  })

  it('integrates fixed signed assertions with durable challenge and replay checks', async () => {
    // @NOTE the pre-signed public fixture represents a previously PDS-issued nonce.
    await db.db
      .insertInto('m8_assurance_challenge')
      .values({
        ...bindings,
        nonceHash: digest(M8_NONCE),
        issuer: M8_ISSUER,
        issuedAt: now,
        expiresAt: now + 60,
        consumedAt: null,
      })
      .execute()
    const verifier = new M8AssuranceVerifier(
      async () => Response.json(primaryJwks),
      {
        issuer: M8_ISSUER,
        jwksUrl: 'https://m8.para.example/assurance/jwks.json',
      },
      store,
      { now: clock },
    )
    const bound = { ...bindings, nonce: M8_NONCE }
    await expect(
      verifier.verify(vectors.tampered, bound),
    ).rejects.toMatchObject({ error: 'InvalidM8Assurance' })
    expect(
      await db.db.selectFrom('m8_assurance_receipt').selectAll().execute(),
    ).toEqual([])
    await expect(verifier.verify(vectors.valid, bound)).resolves.toMatchObject({
      jti: 'm8-jti-primary',
    })
    await expect(verifier.verify(vectors.valid, bound)).rejects.toMatchObject({
      error: 'InvalidM8Assurance',
    })
  })
})

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
