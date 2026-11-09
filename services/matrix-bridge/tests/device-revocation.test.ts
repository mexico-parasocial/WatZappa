import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import pg from 'pg'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatModerationEngine } from '../src/chat-moderation.js'
import type { Config } from '../src/config.js'
import { createDatabase } from '../src/db/index.js'
import type { IBridgeDatabase } from '../src/db/interface.js'
import type { DeviceSession } from '../src/db/records.js'
import {
  requestDeviceRevocation,
  retryDeviceRevocations,
} from '../src/device-revocation.js'
import type * as Auth from '../src/m8-auth.js'
import { createMatrixProjection } from '../src/matrix-projection.js'
import type { MatrixAdminClient } from '../src/matrix.js'
import type { RouteContext } from '../src/routes/context.js'
import { apiRevokeDeviceHandler } from '../src/routes/matrix-identity.js'
import { apiChatBadgesHandler } from '../src/routes/moderation.js'

vi.mock('../src/m8-auth.js', async (original) => ({
  ...(await original<typeof Auth>()),
  authenticateM8: async () => ({ did: 'did:plc:member' }),
}))

const did = 'did:plc:member'
const log = pino({ level: 'silent' })
const session = (id: string, deviceId = id): DeviceSession => ({
  id,
  did,
  mxid: '@member:para',
  deviceId,
  friendlyName: null,
  userAgent: null,
  createdAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  revokedAt: null,
})

describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s: durable device revocation', (driver) => {
  let db: IBridgeDatabase
  let config: Config
  let admin: pg.Pool | undefined
  let schema: string
  let directory: string
  const deactivate = vi.fn<(_mxid: string, _device: string) => Promise<void>>()

  beforeEach(async () => {
    deactivate.mockReset().mockResolvedValue(undefined)
    if (driver === 'postgres') {
      schema = `device_revoke_${randomUUID().replaceAll('-', '')}`
      const url = new URL(process.env.MATRIX_TEST_DATABASE_URL!)
      admin = new pg.Pool({ connectionString: url.toString() })
      await admin.query(`CREATE SCHEMA ${schema}`)
      url.searchParams.set('options', `-c search_path=${schema}`)
      config = { databaseUrl: url.toString() } as Config
    } else {
      directory = mkdtempSync(join(tmpdir(), 'matrix-device-revoke-'))
      config = { dbPath: join(directory, 'bridge.db') } as Config
    }
    db = createDatabase(config)
    await db.createDeviceSession(session('target', 'DEVICE'))
    await db.createDeviceSession(session('same-device', 'DEVICE'))
    await db.createDeviceSession(session('other-device'))
  })
  afterEach(async () => {
    await db.close()
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
      admin = undefined
    } else rmSync(directory, { recursive: true, force: true })
  })

  async function invoke(sessionId: string) {
    const request = Object.assign(new PassThrough(), { headers: {} })
    request.end(JSON.stringify({ sessionId }))
    let status = 0
    let body = ''
    const response = {
      writeHead(code: number) {
        status = code
      },
      end(value: string) {
        body = value
      },
    }
    await apiRevokeDeviceHandler(
      request as unknown as IncomingMessage,
      response as unknown as ServerResponse,
      {
        db,
        matrix: { adminDeactivateDevice: deactivate },
        log,
        config,
      } as unknown as RouteContext,
    )
    return { status, body: JSON.parse(body) }
  }

  it('reports pending without claiming completion when MAS is unavailable', async () => {
    deactivate.mockRejectedValue(new Error('MAS offline'))
    expect(await invoke('target')).toEqual({
      status: 202,
      body: { revoked: false, pending: true },
    })
    expect(await db.getDeviceSession('target')).toMatchObject({
      revokedAt: null,
      revocationPending: true,
    })
    expect(await db.getDeviceSession('same-device')).toMatchObject({
      revokedAt: null,
      revocationPending: true,
    })
    for (let attempt = 0; attempt < 7; attempt++)
      await retryDeviceRevocations(
        db,
        { adminDeactivateDevice: deactivate },
        log,
      )
    expect(await db.getPendingDeviceRevocations()).toHaveLength(1)
    await db.close()
    db = createDatabase(config)
    deactivate.mockResolvedValue(undefined)
    await retryDeviceRevocations(db, { adminDeactivateDevice: deactivate }, log)
    expect(await db.getPendingDeviceRevocations()).toEqual([])
    for (const id of ['target', 'same-device']) {
      const state = await db.getDeviceSession(id)
      expect(state?.revokedAt).not.toBeNull()
      expect(state?.revocationPending).toBe(false)
    }
    expect((await db.getDeviceSession('other-device'))?.revokedAt).toBeNull()
  })

  it('enforces an explicit repeated request for a historical revoked row', async () => {
    await db.revokeDeviceSession(did, 'target')
    const before = (await db.getDeviceSession('target'))?.revokedAt
    deactivate.mockRejectedValueOnce(new Error('MAS offline'))
    expect((await invoke('target')).body).toEqual({
      revoked: false,
      pending: true,
    })
    expect(await db.getPendingDeviceRevocations()).toHaveLength(1)
    expect((await invoke('target')).body).toEqual({
      revoked: true,
      pending: false,
      alreadyRevoked: true,
    })
    expect(deactivate).toHaveBeenCalledTimes(2)
    expect((await db.getDeviceSession('target'))?.revokedAt).toBe(before)
    expect(await db.getPendingDeviceRevocations()).toEqual([])
  })

  it('refuses another account and never acknowledges a non-durable request', async () => {
    await db.createDeviceSession({
      ...session('foreign'),
      did: 'did:plc:other',
    })
    expect((await invoke('foreign')).status).toBe(404)
    expect(deactivate).not.toHaveBeenCalled()
    using _broken = vi
      .spyOn(db, 'queueDeviceRevocation')
      .mockRejectedValueOnce(new Error('disk full'))
    await expect(invoke('target')).rejects.toThrow('disk full')
    expect(await db.getPendingDeviceRevocations()).toEqual([])
  })

  it('removes only the selected community and leaves other chats and devices active', async () => {
    const first = 'at://did:plc:owner/com.para.community.board/first'
    const second = 'at://did:plc:owner/com.para.community.board/second'
    await db.setSpaceForCommunity(first, '!first:para', 'first')
    await db.setSpaceForCommunity(second, '!second:para', 'second')
    await db.setCommunityMembership(did, first, 'removed', [])
    await db.setCommunityMembership(did, second, 'active', ['member'])
    const bans = vi.fn(async () => {})
    const matrix = {
      banUser: bans,
      adminDeactivateDevice: deactivate,
    } as unknown as MatrixAdminClient
    const projection = createMatrixProjection(
      { matrixServerName: 'para' } as Config,
      db,
      matrix,
      log,
    )
    await projection.revokeMemberAccess(
      (await db.getSpaceForCommunity(first))!,
      did,
      'removed',
    )
    expect(bans).toHaveBeenCalledExactlyOnceWith(
      '!first:para',
      '@member:para',
      'Membership state: removed',
    )
    expect(deactivate).not.toHaveBeenCalled()
    expect(
      (await db.listDeviceSessions(did)).every((row) => row.revokedAt === null),
    ).toBe(true)
    expect(
      (await db.getActiveCommunityRoomsForDid(did)).map((room) => room.roomId),
    ).toEqual(['!second:para'])
    expect(await db.getPendingDeviceRevocations()).toEqual([])
  })

  it('returns explicit roles refreshed from authority rather than cached badge context', async () => {
    const community = 'at://did:plc:owner/com.para.community.board/roles'
    await db.setCommunityMembership(did, community, 'active', [
      'member',
      'owner',
    ])
    const request = Object.assign(new PassThrough(), {
      headers: {},
      url: `/api/chat-badges?did=${did}&community=${encodeURIComponent(community)}`,
    })
    let text = ''
    const response = {
      writeHead() {},
      end(value: string) {
        text = value
      },
    }
    await apiChatBadgesHandler(
      request as unknown as IncomingMessage,
      response as unknown as ServerResponse,
      {
        db,
        config: { ...config, port: 3001 },
        chatMod: new ChatModerationEngine(db, log),
        firehose: {
          async refreshMembership() {
            await db.setCommunityMembership(did, community, 'active', [
              'member',
            ])
          },
        },
      } as unknown as RouteContext,
    )
    expect(JSON.parse(text).roles).toEqual(['member'])
    expect(JSON.parse(text).hiddenBadges).toEqual([])
    expect(JSON.parse(text)).not.toHaveProperty('participation')
  })

  it('persists intent before the external request and clears it only after success', async () => {
    deactivate.mockImplementation(async () => {
      expect(await db.getPendingDeviceRevocations()).toHaveLength(1)
      expect((await db.getDeviceSession('target'))?.revokedAt).toBeNull()
    })
    await requestDeviceRevocation(
      db,
      { adminDeactivateDevice: deactivate },
      session('target', 'DEVICE'),
    )
    expect((await db.getDeviceSession('target'))?.revokedAt).not.toBeNull()
    expect(await db.getPendingDeviceRevocations()).toEqual([])
  })
})
