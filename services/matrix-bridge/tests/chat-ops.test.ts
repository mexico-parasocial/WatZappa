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
import { createOpsServer, syncLogProvisioningQueue } from '../src/ops.js'

describe.each([
  'sqlite',
  ...(process.env.MATRIX_TEST_DATABASE_URL ? ['postgres'] : []),
])('%s private chat operations', (driver) => {
  let store: ControlStore, db: IBridgeDatabase
  let server: ReturnType<typeof createOpsServer>,
    origin: string,
    directory: string
  let admin: pg.Pool | undefined, schema: string
  let fail: boolean, calls: number, revoked: string[]
  const communityUri = 'at://did:plc:ops/com.para.community.board/stage'
  const creator = 'did:plc:ops'
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
    // Stands in for firehose.retryCommunityProvision: the rooms come from
    // the current PDS record, never from a stored payload.
    const provision = async (community: string) => {
      calls++
      if (fail) throw Error('Homeserver unavailable')
      await db.setSpaceForCommunity(
        community,
        '!space:ops.test',
        'stage',
        'bicameral',
      )
      await db.setChamberRooms(
        community,
        '!a:ops.test',
        '!b:ops.test',
        '!observers:ops.test',
      )
    }
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
        },
      },
      store,
      syncLogProvisioningQueue(db, provision),
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
  const queueJob = async () => {
    await db.logSync(
      'create_space',
      communityUri,
      creator,
      null,
      false,
      'upstream detail',
    )
    const [job] = await db.getProvisioningRetryJobs(10)
    return job
  }

  it('refuses a spoofed identity or a PDS-only operator', async () => {
    expect((await request('/status', { key: 'wrong' })).status).toBe(403)
    expect((await request('/status', { actor: 'pds-admin' })).status).toBe(403)
    expect((await request('/status', { actor: 'bob' })).status).toBe(200)
  })
  it('retries a queued provisioning job once, audited, without changing governance', async () => {
    const job = await queueJob()
    await db.setCommunityMembership(creator, communityUri, 'removed', [])
    const status = await (await request()).json()
    expect(status.jobs).toEqual([
      expect.objectContaining({ id: String(job.id), communityUri }),
    ])
    expect(JSON.stringify(status)).not.toContain('upstream detail')

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
    expect((await db.getSpaceForCommunity(communityUri))?.chamberB_RoomId).toBe(
      '!b:ops.test',
    )
    expect(
      (await db.getCommunityMembership(creator, communityUri))?.state,
    ).toBe('removed')
    expect(await db.getProvisioningRetryJobs(10)).toEqual([])
    // A replay of the same request answers from the audit, not the homeserver.
    expect((await request(path, { method: 'POST', body })).status).toBe(200)
    expect(calls).toBe(1)
    expect((await store.audit())[0]).toMatchObject({
      operator: 'alice',
      action: 'retry',
      target: String(job.id),
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
    // Already provisioned: no longer queued, nothing to retry.
    expect(
      (
        await request(path, {
          method: 'POST',
          body: { ...body, requestId: randomUUID() },
        })
      ).status,
    ).toBe(409)
    expect(calls).toBe(1)
  })
  it('keeps a job queued, counted and audited when the retry fails', async () => {
    const job = await queueJob()
    fail = true
    const body = { requestId: randomUUID(), reason: 'Retry during outage' }
    const response = await request(`/jobs/${job.id}/retry`, {
      method: 'POST',
      body,
    })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'CHAT_OPERATION_FAILED' })
    expect(await db.getProvisioningRetryJobs(10)).toMatchObject([
      { id: job.id, retryCount: 1 },
    ])
    expect((await store.audit())[0]).toMatchObject({ result: 'failed' })
  })
  it('refuses a job id that is not a queue entry', async () => {
    const response = await request('/jobs/not-a-number/retry', {
      method: 'POST',
      body: { requestId: randomUUID(), reason: 'Looking for trouble' },
    })
    expect(response.status).toBe(404)
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
  it('does not repeat an operation interrupted after its durable audit began', async () => {
    const job = await queueJob()
    const body = {
      requestId: randomUUID(),
      reason: 'Reviewed recovery after homeserver outage',
    }
    await store.beginAudit({
      ...body,
      operator: 'alice',
      action: 'retry',
      target: String(job.id),
    })
    const response = await request(`/jobs/${job.id}/retry`, {
      method: 'POST',
      body,
    })
    expect(response.status).toBe(409)
    expect((await response.json()).result).toBe('running')
    expect(calls).toBe(0)
  })
})
