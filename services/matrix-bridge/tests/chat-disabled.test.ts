import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import pino from 'pino'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Bridge, createBridge } from '../src/bridge.js'
import {
  CHAT_DISABLED,
  isProvisionedSpace,
  unprovisionedSpaceId,
} from '../src/chat-mode.js'
import { ChatModerationEngine } from '../src/chat-moderation.js'
import { loadConfig } from '../src/config.js'
import type { Config } from '../src/config.js'
import { SqliteBridgeDatabase } from '../src/db/index.js'
import { EventBus } from '../src/events/bus.js'
import { FirehoseConsumer } from '../src/firehose.js'
import type * as M8Auth from '../src/m8-auth.js'
import type { MatrixProjectionPort } from '../src/matrix-projection.js'
import { BridgeMetrics } from '../src/metrics.js'
import { ProposalEngine } from '../src/proposals.js'
import { RetryWorker } from '../src/retry.js'

const owner = 'did:plc:owner'
const community = 'at://did:plc:owner/com.para.community.board/one'

// Anything that would reach a homeserver records itself here.
const matrixUse = vi.hoisted(() => ({
  clients: 0,
  pollers: 0,
  sweeps: 0,
}))
vi.mock('../src/matrix.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  MatrixAdminClient: class {
    readonly botUserId = undefined
    constructor() {
      matrixUse.clients++
    }
  },
}))
vi.mock('../src/matrix-sync.js', () => ({
  MatrixSyncPoller: class {
    constructor() {
      matrixUse.pollers++
    }
    setEventBus() {}
    start() {}
    stop() {}
  },
}))
vi.mock('../src/membership-lease.js', () => ({
  sweepExpiredMembershipLeases: async () => {
    matrixUse.sweeps++
    return 0
  },
}))
// A firehose that stays "connected": start() only returns once destroyed, as
// the real one does while it has a PDS to read from.
vi.mock('@atproto/sync', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Firehose: class {
    private destroyed!: () => void
    private running = new Promise<void>((resolve) => {
      this.destroyed = resolve
    })
    constructor(readonly opts: { service: string }) {}
    start() {
      return this.running
    }
    async destroy() {
      this.destroyed()
    }
  },
}))
vi.mock('../src/m8-auth.js', async (importOriginal) => ({
  ...(await importOriginal<typeof M8Auth>()),
  authenticateM8: async () => ({ did: owner }),
}))

const MATRIX_ENV = [
  'MATRIX_CHAT_ENABLED',
  'MATRIX_ADMIN_TOKEN',
  'MATRIX_HOMESERVER_URL',
  'MATRIX_SERVER_NAME',
  'MATRIX_PUBLIC_HOMESERVER_URL',
  'MATRIX_APPSERVICE_TOKEN',
  'MATRIX_HS_TOKEN',
  'MATRIX_BOT_USER_ID',
  'MATRIX_ENABLE_ENCRYPTION',
]
const BRIDGE_ENV = [
  'BRIDGE_DB_PATH',
  'BRIDGE_AUTHORITY_APPVIEW_URL',
  'PARA_AUTHORITY_SERVICE_TOKEN',
  'PDS_FIREHOSE_URL',
  'PORT',
  'BRIDGE_LOG_LEVEL',
  'CHAT_OPS_PORT',
]
const saved = new Map<string, string | undefined>()

// Stands in for the AppView's verified authority endpoint: the owner is an
// active member, owner and moderator.
let appview: Server
let bridge: Bridge | undefined

beforeEach(async () => {
  for (const key of [...MATRIX_ENV, ...BRIDGE_ENV]) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }
  matrixUse.clients = 0
  matrixUse.pollers = 0
  matrixUse.sweeps = 0
  appview = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        roles: ['member', 'moderator', 'owner'],
        authorization: { policy: 'verified_authority_service' },
      }),
    )
  })
  await new Promise<void>((resolve) => appview.listen(0, '127.0.0.1', resolve))
  process.env.BRIDGE_DB_PATH = ':memory:'
  process.env.BRIDGE_AUTHORITY_APPVIEW_URL = `http://127.0.0.1:${(appview.address() as AddressInfo).port}`
  process.env.PARA_AUTHORITY_SERVICE_TOKEN = 'a'.repeat(40)
  // Nothing listens here: the firehose retries quietly in the background.
  process.env.PDS_FIREHOSE_URL = 'ws://127.0.0.1:9'
  process.env.PORT = '0'
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await bridge?.stop()
  bridge = undefined
  await new Promise<void>((resolve) => appview.close(() => resolve()))
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

async function startBridge(): Promise<string> {
  bridge = await createBridge(loadConfig(), pino({ level: 'silent' }))
  const { server } = bridge
  const listening = new Promise<void>((resolve) =>
    server.once('listening', () => resolve()),
  )
  void bridge.start()
  await listening
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

describe('chat off (MATRIX_CHAT_ENABLED=false)', () => {
  it('loads config without any Matrix setting', () => {
    process.env.MATRIX_CHAT_ENABLED = 'false'
    const config = loadConfig()
    expect(config.matrixChatEnabled).toBe(false)
    expect(config.matrixAdminToken).toBeUndefined()
  })

  it('still requires MATRIX_ADMIN_TOKEN when chat is on', () => {
    expect(() => loadConfig()).toThrow('MATRIX_ADMIN_TOKEN')
  })

  it('starts with no homeserver and serves governance', async () => {
    process.env.MATRIX_CHAT_ENABLED = 'false'
    // Half-configured on purpose: reading it would throw. With chat off the
    // operations listener (and its MAS/device actions) is never set up.
    process.env.CHAT_OPS_PORT = '3002'
    const base = await startBridge()
    const { db, firehose } = bridge!.ctx
    expect(bridge!.ctx.matrix).toBeNull()

    // A community created while chat is off keeps its governance facts and
    // is queued for room provisioning.
    await (firehose as any).handleCommunityCreate(
      owner,
      { name: 'One', chamberMode: 'bicameral' },
      community,
      'one',
    )
    const space = await db.getSpaceForCommunity(community)
    expect(space?.chamberMode).toBe('bicameral')
    expect(isProvisionedSpace(space!)).toBe(false)
    expect((await db.getCommunityMembership(owner, community))?.state).toBe(
      'active',
    )
    expect(await db.getProvisioningRetryJobs(10)).toMatchObject([
      { eventType: 'create_space', communityUri: community, did: owner },
    ])

    await db.setConstitution(community, 1, '{}')

    const enc = encodeURIComponent(community)
    for (const path of [
      '/healthz',
      `/api/constitution?uri=${enc}`,
      `/api/proposals?community=${enc}`,
      `/api/decisions?community=${enc}`,
      `/api/moderation-dashboard?community=${enc}&modDid=${owner}`,
      `/api/moderation-reports?community=${enc}&modDid=${owner}`,
      `/api/chat-member-list?community=${enc}`,
      `/api/chat-badges?did=${owner}&community=${enc}`,
    ]) {
      const res = await fetch(base + path)
      expect({ path, status: res.status }).toEqual({ path, status: 200 })
    }

    // The Expo token still registers: sortition notices are sent with it.
    const push = await fetch(`${base}/api/push-token`, {
      method: 'POST',
      body: JSON.stringify({ expoPushToken: 'ExponentPushToken[x]' }),
    })
    expect(push.status).toBe(200)
    expect(await db.getPushTokensByDid([owner])).toHaveLength(1)

    for (const [method, path] of [
      ['POST', '/api/matrix-challenge'],
      ['POST', '/api/matrix-identity'],
      ['POST', '/api/matrix-attest'],
      ['POST', '/api/matrix-token'],
      ['POST', '/api/community-join'],
      ['GET', '/api/rooms'],
      ['GET', `/api/unread?community=${enc}`],
      ['POST', '/api/mark-read'],
      ['GET', `/api/space-for-community?community=${enc}`],
      ['GET', '/api/dm-requests'],
      ['POST', '/api/dm-requests'],
      ['GET', '/api/devices'],
      ['POST', '/_matrix/push/v1/notify'],
      ['PUT', '/_matrix/app/v1/transactions/1'],
    ]) {
      const res = await fetch(base + path, {
        method,
        body: method === 'GET' ? undefined : '{}',
      })
      expect({ path, status: res.status }).toEqual({ path, status: 503 })
      expect(await res.json()).toMatchObject({ error: CHAT_DISABLED })
    }

    expect(matrixUse).toEqual({ clients: 0, pollers: 0, sweeps: 0 })
  })

  it('starts the Matrix side when chat is on', async () => {
    process.env.MATRIX_ADMIN_TOKEN = 'fixture-only'
    const base = await startBridge()
    expect(matrixUse.clients).toBe(1)
    expect(matrixUse.pollers).toBe(1)
    const res = await fetch(`${base}/api/matrix-token`, {
      method: 'POST',
      body: '{}',
    })
    expect(res.status).not.toBe(503)
  })
})

describe('scheduled jobs', () => {
  const HOUR = 3_600_000

  // Only the job clocks are faked; the HTTP server and the database run as
  // usual. The firehose above never returns, like a connected one.
  const startWithJobClock = async () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    })
    const jobs = {
      proposals: vi.spyOn(ProposalEngine.prototype, 'processStateTransitions'),
      sanctions: vi.spyOn(
        ChatModerationEngine.prototype,
        'liftExpiredSanctions',
      ),
      badges: vi.spyOn(ChatModerationEngine.prototype, 'runExpiry'),
      prune: vi.spyOn(EventBus.prototype, 'prune'),
    }
    await startBridge()
    await vi.advanceTimersByTimeAsync(HOUR)
    return jobs
  }

  it('runs the governance jobs with chat off while the firehose is connected', async () => {
    process.env.MATRIX_CHAT_ENABLED = 'false'
    const jobs = await startWithJobClock()
    expect(jobs.proposals).toHaveBeenCalledTimes(6) // every 10 min
    expect(jobs.sanctions).toHaveBeenCalledTimes(60) // every minute
    expect(jobs.badges).toHaveBeenCalledTimes(12) // every 5 min
    expect(jobs.prune).toHaveBeenCalledTimes(1) // hourly
    expect(matrixUse.sweeps).toBe(0)
  })

  it('runs the membership-lease sweep only with chat on', async () => {
    process.env.MATRIX_ADMIN_TOKEN = 'fixture-only'
    const jobs = await startWithJobClock()
    expect(jobs.proposals).toHaveBeenCalledTimes(6)
    // Once a minute after start, then hourly.
    expect(matrixUse.sweeps).toBe(2)
  })
})

describe('turning chat on later', () => {
  it('provisions a community recorded while chat was off', async () => {
    const db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as never)
    const log = pino({ level: 'silent' })
    await db.setSpaceForCommunity(
      community,
      unprovisionedSpaceId(community),
      'one',
      'bicameral',
    )
    await db.logSync('create_space', community, owner, null, false, 'x')
    const provision = vi.fn(async () => {
      await db.setSpaceForCommunity(
        community,
        '!space:para',
        'one',
        'bicameral',
      )
    })
    const worker = (chatEnabled: boolean) =>
      new RetryWorker(
        db,
        {} as MatrixProjectionPort,
        new BridgeMetrics(),
        log,
        async () => {},
        provision,
        chatEnabled,
      )

    // Chat off: the job waits.
    await (worker(false) as any).run()
    expect(provision).not.toHaveBeenCalled()
    expect(await db.getProvisioningRetryJobs(10)).toHaveLength(1)

    // Chat on: the create_space retry job provisions it.
    await (worker(true) as any).run()
    expect(provision).toHaveBeenCalledWith(community, owner)
    expect(await db.getProvisioningRetryJobs(10)).toHaveLength(0)
    expect(
      isProvisionedSpace((await db.getSpaceForCommunity(community))!),
    ).toBe(true)
    await db.close()
  })

  it('the retry job creates the rooms over the governance-only row', async () => {
    const config = {
      dbPath: ':memory:',
      pdsFirehoseUrl: 'http://127.0.0.1:9',
      backfillFromStart: false,
      matrixChatEnabled: true,
    } as Config
    const db = new SqliteBridgeDatabase(config)
    const log = pino({ level: 'silent' })
    await db.setSpaceForCommunity(
      community,
      unprovisionedSpaceId(community),
      'one',
      'bicameral',
    )
    const createCommunitySpace = vi.fn<
      MatrixProjectionPort['createCommunitySpace']
    >(async () => ({
      spaceId: '!space:para',
      chamberA_RoomId: '!a:para',
      chamberB_RoomId: '!b:para',
      observerRoomId: '!obs:para',
    }))
    const firehose = new FirehoseConsumer(
      config,
      db,
      {
        createCommunitySpace,
        applyMemberRoles: async () => {},
        revokeMemberAccess: async () => 0,
      } as unknown as MatrixProjectionPort,
      {} as ProposalEngine,
      new ChatModerationEngine(db, log),
      new BridgeMetrics(),
      log,
      async () => ({ state: 'active', roles: ['member', 'owner'] }),
    )
    await (firehose as any).handleCommunityCreate(
      owner,
      { name: 'One', chamberMode: 'bicameral' },
      community,
      'one',
      true,
    )
    expect(createCommunitySpace).toHaveBeenCalledOnce()
    expect(await db.getSpaceForCommunity(community)).toMatchObject({
      spaceId: '!space:para',
      chamberA_RoomId: '!a:para',
      chamberB_RoomId: '!b:para',
      observerRoomId: '!obs:para',
    })
    await db.close()
  })
})
