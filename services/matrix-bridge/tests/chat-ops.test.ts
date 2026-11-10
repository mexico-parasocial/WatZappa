import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ControlStore } from '../src/control-store.js'
import { type IBridgeDatabase, createDatabase } from '../src/db/index.js'
import { createOpsServer } from '../src/ops.js'
import { CommunityProvisioner } from '../src/provisioning.js'

describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s private chat operations', (driver) => {
  let store: ControlStore,
    db: IBridgeDatabase,
    provisioner: CommunityProvisioner
  let server: ReturnType<typeof createOpsServer>,
    origin: string,
    directory: string
  let admin: pg.Pool | undefined, schema: string
  let fail: boolean, calls: number, revoked: string[]
  const input = {
    communityUri: 'at://did:plc:ops/com.para.community.board/stage',
    name: 'Stage',
    slug: 'stage',
    chamberMode: 'bicameral',
  }
  const secret = 'a'.repeat(64)
  const log = pino({ enabled: false })
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'chat-ops-test-'))
    let databaseUrl: string | undefined
    if (driver === 'postgres') {
      const url = new URL(process.env.MATRIX_TEST_DATABASE_URL!)
      admin = new pg.Pool({ connectionString: url.toString() })
      schema = `ops_${randomUUID().replaceAll('-', '')}`
      await admin.query(`CREATE SCHEMA ${schema}`)
      url.searchParams.set('options', `-c search_path=${schema}`)
      databaseUrl = url.toString()
    }
    const config = { databaseUrl, dbPath: join(directory, 'bridge.db') }
    db = createDatabase(config as never)
    await db.getSpaceCount() // Complete the bridge schema before serving.
    store = new ControlStore(config)
    fail = false
    calls = 0
    revoked = []
    provisioner = new CommunityProvisioner(
      store,
      db,
      {
        async createCommunitySpace() {
          calls++
          if (fail) throw Error('Homeserver unavailable')
          return {
            spaceId: '!space:ops.test',
            chamberA_RoomId: '!a:ops.test',
            chamberB_RoomId: '!b:ops.test',
            observerRoomId: '!observers:ops.test',
          }
        },
      },
      log,
    )
    server = createOpsServer(
      {
        host: '127.0.0.1',
        port: 0,
        secret,
        origin: 'https://ops.test',
        operators: { alice: 'operator', bob: 'viewer' },
        probes: {},
      },
      {
        db,
        log,
        matrix: {
          async adminDeactivateDevice(mxid: string, deviceId: string) {
            revoked.push(`${mxid}/${deviceId}`)
          },
        } as never,
      },
      store,
      provisioner,
    )
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await store.close()
    await db.close()
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
      admin = undefined
    }
    await rm(directory, { recursive: true, force: true })
  })
  function request(
    path = '/status',
    options: {
      actor?: string
      key?: string
      method?: string
      body?: unknown
      omitOrigin?: boolean
    } = {},
  ) {
    return fetch(origin + '/chat-ops/v1' + path, {
      method: options.method ?? 'GET',
      headers: {
        'x-para-operator': options.actor ?? 'alice',
        'x-para-ops-key': options.key ?? secret,
        'content-type': 'application/json',
        'x-para-chat-action': '1',
        ...(options.omitOrigin ? {} : { origin: 'https://ops.test' }),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  }
  it('refuses a spoofed identity or a PDS-only operator', async () => {
    expect((await request('/status', { key: 'wrong' })).status).toBe(403)
    expect((await request('/status', { actor: 'pds-admin' })).status).toBe(403)
    expect((await request('/status', { actor: 'bob' })).status).toBe(200)
  })
  it('persists a failed partial provisioning job and retries without changing governance', async () => {
    fail = true
    await provisioner.enqueue(input)
    const [job] = await store.jobs()
    expect(job.state).toBe('failed')
    await db.setCommunityMembership(
      'did:plc:ops',
      input.communityUri,
      'removed',
      [],
    )
    fail = false
    const body = {
      requestId: randomUUID(),
      reason: 'Homeserver restored after outage',
    }
    const path = `/jobs/${job.id}/retry`
    expect(
      (await request(path, { method: 'POST', body, actor: 'bob' })).status,
    ).toBe(403)
    expect(
      (await request(path, { method: 'POST', body, omitOrigin: true })).status,
    ).toBe(403)
    expect((await request(path, { method: 'POST', body })).status).toBe(200)
    expect(
      (await db.getSpaceForCommunity(input.communityUri))?.chamberB_RoomId,
    ).toBe('!b:ops.test')
    expect(
      (await db.getCommunityMembership('did:plc:ops', input.communityUri))
        ?.state,
    ).toBe('removed')
    expect((await request(path, { method: 'POST', body })).status).toBe(200)
    expect(calls).toBe(2)
    expect((await store.audit())[0]).toMatchObject({
      operator: 'alice',
      action: 'retry',
      target: job.id,
      result: 'success',
      requestId: body.requestId,
    })
    expect(
      (
        await request(path, {
          method: 'POST',
          body: { ...body, reason: 'Different intent' },
        })
      ).status,
    ).toBe(409)
    expect(
      (
        await request(path, {
          method: 'POST',
          body: { ...body, requestId: randomUUID() },
        })
      ).status,
    ).toBe(200)
    expect(calls).toBe(2)
  })
  it('reclaims expired jobs after restart while refusing a second live claim', async () => {
    const id = await store.enqueue(input)
    expect(await store.claim(id)).toBeDefined()
    expect(await store.claim(id, true)).toBeUndefined()
    await store.query(
      'UPDATE chat_provision_jobs SET lease_until=$2 WHERE id=$1',
      [id, '2000-01-01T00:00:00.000Z'],
    )
    expect(await provisioner.retry(id)).toBe(true)
    expect((await store.jobs())[0].state).toBe('done')
  })
  it('revokes only after durable audit and never returns the DID or MXID', async () => {
    await db.createDeviceSession({
      id: 'device-opaque',
      did: 'did:plc:hidden',
      mxid: '@hidden:ops.test',
      deviceId: 'SDK_DEVICE',
      friendlyName: 'Phone',
      userAgent: null,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      revokedAt: null,
    })
    const response = await request('/devices/device-opaque/revoke', {
      method: 'POST',
      body: { requestId: randomUUID(), reason: 'Lost phone reported by owner' },
    })
    expect(response.status).toBe(200)
    expect(revoked).toEqual(['@hidden:ops.test/SDK_DEVICE'])
    expect(
      (await db.getDeviceSession('device-opaque'))?.revokedAt,
    ).not.toBeNull()
    const status = await (await request()).json()
    expect(status.devices[0]).toMatchObject({
      id: 'device-opaque',
      deviceId: 'SDK_DEVICE',
    })
    expect(JSON.stringify(status)).not.toContain('did:plc:hidden')
    expect(JSON.stringify(status)).not.toContain('@hidden:ops.test')
  })

  it('makes a crash on the final automatic attempt eligible for explicit operator recovery', async () => {
    const id = await store.enqueue(input)
    await store.query(
      "UPDATE chat_provision_jobs SET state='running',attempts=5,lease_until=$2 WHERE id=$1",
      [id, '2000-01-01T00:00:00.000Z'],
    )
    expect(await store.pending()).toEqual([])
    expect((await store.jobs())[0].state).toBe('failed')
    expect(await provisioner.retry(id, true)).toBe(true)
    expect((await store.jobs())[0]).toMatchObject({
      state: 'done',
      attempts: 6,
    })
  })
  it('ignores a stale worker completion after a replacement claim', async () => {
    const id = await store.enqueue(input)
    const original = (await store.claim(id))!
    await store.query(
      'UPDATE chat_provision_jobs SET lease_until=$2 WHERE id=$1',
      [id, '2000-01-01T00:00:00.000Z'],
    )
    const replacement = (await store.claim(id))!
    await store.finish(id, 'failed', original.attempts)
    expect((await store.jobs())[0].state).toBe('running')
    await store.finish(id, 'done', replacement.attempts)
    expect((await store.jobs())[0].state).toBe('done')
  })

  it('does not repeat an operation interrupted after its durable audit began', async () => {
    const id = await store.enqueue(input)
    const body = {
      requestId: randomUUID(),
      reason: 'Reviewed recovery after homeserver outage',
    }
    await store.beginAudit({
      ...body,
      operator: 'alice',
      action: 'retry',
      target: id,
    })
    const response = await request(`/jobs/${id}/retry`, {
      method: 'POST',
      body,
    })
    expect(response.status).toBe(409)
    expect((await response.json()).result).toBe('running')
    expect(calls).toBe(0)
  })
})
