import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BridgeDatabase } from '../db/sqlite/index.js'

/*
 * The identity-boundary CI suite, server half (MATRIX_V2 §8). The client
 * half — "the voting key has no Matrix account" — lives in
 * iM8/src/services/__tests__/matrixIdentity.test.ts. This half pins the
 * property the v1 bridge violated (F7/CD-M1): no DID↔MXID table exists, and
 * there is no code path that mints one.
 */

describe('identity boundary (CD-M1, server side)', () => {
  let db: BridgeDatabase
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `para-bridge-boundary-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    )
    db = new BridgeDatabase({ dbPath } as any)
  })

  afterEach(() => {
    db.close()
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // cleanup may fail if file didn't exist
    }
  })

  it('the v1 mapping table is dropped at startup, not merely unwritten', () => {
    // The PW-CLEANUP lesson applied to linkage itself: stopping new writes
    // while leaving deployed rows would keep the artefact alive.
    const rows = (db as any)
      .db!.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_matrix_map'",
      )
      .all()
    expect(rows).toEqual([])
  })

  it('seeding a v1 table manually does not survive a restart', () => {
    ;(db as any)
      .db!.prepare(
        'CREATE TABLE user_matrix_map (did TEXT PRIMARY KEY, matrix_user_id TEXT NOT NULL, password TEXT NOT NULL)',
      )
      .run()
    ;(db as any)
      .db!.prepare(
        "INSERT INTO user_matrix_map VALUES ('did:plc:x', '@did-plc-x:s', 'pw')",
      )
      .run()
    db.close()
    db = new BridgeDatabase({ dbPath } as any)
    const rows = (db as any)
      .db!.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_matrix_map'",
      )
      .all()
    expect(rows).toEqual([])
  })

  it('no store method resolves an MXID from a DID', () => {
    // The forward direction is the push model (F7): its absence at the type
    // level is what stops it from being reintroduced by a later caller.
    const anyDb = db as unknown as Record<string, unknown>
    expect(anyDb['getMxidForDid']).toBeUndefined()
    expect(anyDb['setMxidForDid']).toBeUndefined()
    expect(anyDb['getUserPassword']).toBeUndefined()
  })

  it('reverse attribution resolves only through minted device sessions', async () => {
    const did = 'did:plc:member'
    const mxid = '@k4o2lmcmitomgymtdb7y3htsthoofobo:matrix.example'
    // No sessions: an MXID cannot be attributed, even one the bridge derived.
    expect(db.getDidForMxid(mxid)).toBeUndefined()
    const now = new Date().toISOString()
    db.createDeviceSession({
      id: randomUUID(),
      did,
      mxid,
      deviceId: 'DEV',
      friendlyName: null,
      userAgent: null,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    })
    expect(db.getDidForMxid(mxid)).toBe(did)
    // Revoked sessions stop attributing.
    ;(db as any)
      .db!.prepare("UPDATE device_sessions SET revoked_at = datetime('now')")
      .run()
    expect(db.getDidForMxid(mxid)).toBeUndefined()
  })

  it('the membership lease is DID-free and expires by cutoff', async () => {
    const uri = 'at://c/com.para.community.board/one'
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
    const fresh = new Date().toISOString()
    db.upsertCommunityMembershipLease(uri, '@stale:matrix.example', old)
    db.upsertCommunityMembershipLease(uri, '@current:matrix.example', fresh)
    // Upsert renews rather than duplicates.
    db.upsertCommunityMembershipLease(uri, '@stale:matrix.example', fresh)
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    const expired = db.getExpiredCommunityMembershipLeases(cutoff)
    expect(expired).toEqual([])
    // A cutoff after both expires both; deleting one removes only it.
    db.deleteCommunityMembershipLease(uri, '@stale:matrix.example')
    expect(
      db.getExpiredCommunityMembershipLeases(
        new Date(Date.now() + 1000).toISOString(),
      ),
    ).toEqual([
      {
        communityUri: uri,
        mxid: '@current:matrix.example',
        lastVerifiedAt: fresh,
      },
    ])
    // The lease table carries no DID column — it must not be a mapping in
    // disguise.
    const cols = (db as any)
      .db!.prepare('PRAGMA table_info(community_membership_lease)')
      .all()
      .map((c: any) => c.name)
    expect(cols).toEqual(['community_uri', 'mxid', 'last_verified_at'])
  })

  it('the member list carries no chat account identifier', () => {
    const uri = 'at://c/com.para.community.board/one'
    db.setCommunityMembership('did:plc:member', uri, 'active', [])
    ;(db as any)
      .db!.prepare(
        `INSERT INTO chat_participation_stats (did, community_uri, message_count, first_message_at, last_message_at, joined_at)
         VALUES ('did:plc:member', ?, 1, datetime('now'), datetime('now'), datetime('now'))`,
      )
      .run(uri)
    const now = new Date().toISOString()
    db.createDeviceSession({
      id: randomUUID(),
      did: 'did:plc:member',
      mxid: '@someone:matrix.example',
      deviceId: 'DEV',
      friendlyName: null,
      userAgent: null,
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    })
    const rows = (db as any).getMemberList(uri) as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].did).toBe('did:plc:member')
    // F8 ranked this endpoint as "the linkage table served over HTTP": the
    // response must not carry any chat-account identifier.
    expect(rows[0].matrix_user_id).toBeUndefined()
    expect(Object.keys(rows[0])).not.toContain('matrixUserId')
  })
})
