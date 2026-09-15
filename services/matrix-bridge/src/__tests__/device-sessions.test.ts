import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BridgeDatabase } from '../db/sqlite/index.js'

describe('BridgeDatabase — device sessions', () => {
  let db: BridgeDatabase
  let dbPath: string

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `para-bridge-test-${Date.now()}.db`)
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

  const did = 'did:plc:alice123'
  const mxid = '@did-plc-alice123:para.social'

  const sample = (
    over: Partial<Parameters<BridgeDatabase['createDeviceSession']>[0]> = {},
  ) => ({
    id: `session-${Math.random().toString(36).slice(2)}`,
    did,
    mxid,
    deviceId: `PARA-${Math.random().toString(36).slice(2, 10)}`,
    friendlyName: 'iPhone 15',
    userAgent: 'Expo/ios',
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    revokedAt: null,
    ...over,
  })

  it('creates, lists, and gets a device session', async () => {
    const a = sample()
    const b = sample({ friendlyName: 'Pixel 8' })
    await db.createDeviceSession(a)
    await db.createDeviceSession(b)

    const list = await db.listDeviceSessions(did)
    expect(list).toHaveLength(2)
    expect(list.map((d) => d.id).sort()).toEqual([a.id, b.id].sort())

    const got = await db.getDeviceSession(a.id)
    expect(got?.deviceId).toBe(a.deviceId)
    expect(got?.friendlyName).toBe('iPhone 15')
    expect(got?.revokedAt).toBeNull()
  })

  it('scopes listings to the owning DID', async () => {
    await db.createDeviceSession(sample())
    await db.createDeviceSession(sample({ did: 'did:plc:bob' }))

    const list = await db.listDeviceSessions(did)
    expect(list).toHaveLength(1)
  })

  it('revokes only the owner session, once', async () => {
    const s = sample()
    await db.createDeviceSession(s)

    expect(await db.revokeDeviceSession(did, s.id)).toBe(true)
    const revoked = await db.getDeviceSession(s.id)
    expect(revoked?.revokedAt).not.toBeNull()

    // second revoke reports already-revoked and does not change the timestamp
    expect(await db.revokeDeviceSession(did, s.id)).toBe(false)

    // another DID cannot revoke someone else's session
    const other = sample()
    await db.createDeviceSession(other)
    expect(await db.revokeDeviceSession('did:plc:mallory', other.id)).toBe(
      false,
    )
  })

  it('touches lastSeenAt', async () => {
    const s = sample({
      lastSeenAt: new Date(Date.now() - 60_000).toISOString(),
    })
    await db.createDeviceSession(s)
    await db.touchDeviceSession(s.id)
    const after = await db.getDeviceSession(s.id)
    expect(new Date(after!.lastSeenAt).getTime()).toBeGreaterThan(
      new Date(s.lastSeenAt).getTime(),
    )
  })
})
