import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { type IncomingMessage, createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { setTimeout as delay } from 'node:timers/promises'
import { SqliteBridgeDatabase } from '../src/db/sqlite-wrapper.js'
import { EventBus } from '../src/events/bus.js'
import { appServiceTransactionHandler } from '../src/routes/appservice-txn.js'
import type { RouteContext } from '../src/routes/context.js'
import { apiEventsSseHandler } from '../src/routes/events.js'
import { readBody } from '../src/routes/http.js'

// @NOTE completely isolated homeserver, users, rooms and database. No live credentials.
const name = `para-chat-smoke-${randomUUID().slice(0, 8)}`
const dir = await mkdtemp(join(tmpdir(), 'para-chat-smoke-'))
const asToken = randomUUID()
const hsToken = randomUUID()
const db = new SqliteBridgeDatabase({ dbPath: ':memory:' } as never)
const log = { warn() {}, info() {} }
const bus = new EventBus(db, log)
const ctx = {
  db,
  events: bus,
  log,
  config: { matrixHsToken: hsToken },
} as unknown as RouteContext
let lastTransaction: { url: string; body: string } | undefined
let active = false
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/sessions/me') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ session: { did: 'did:plc:smoke' } }))
    } else if (req.url === '/api/events') {
      await apiEventsSseHandler(req, res, ctx)
    } else if (req.url?.includes('/transactions/')) {
      const body = await readBody(req, 4 * 1024 * 1024)
      lastTransaction = { url: req.url, body }
      const input = new PassThrough() as unknown as IncomingMessage
      input.method = req.method
      input.url = req.url
      input.headers = req.headers
      ;(input as unknown as PassThrough).end(body)
      await appServiceTransactionHandler(input, res, ctx)
    } else {
      res.writeHead(404)
      res.end()
    }
  } catch {
    res.writeHead(500)
    res.end()
  }
})
const abort = new AbortController()
try {
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))
  const port = (server.address() as { port: number }).port
  ctx.config.port = port
  ctx.config.m8BaseUrl = `http://127.0.0.1:${port}`
  await writeFile(
    join(dir, 'registration.yaml'),
    JSON.stringify({
      id: 'week1',
      url: `http://host.docker.internal:${port}`,
      as_token: asToken,
      hs_token: hsToken,
      sender_localpart: 'week1',
      rate_limited: false,
      namespaces: {
        users: [{ regex: '@week1.*', exclusive: true }],
        rooms: [],
        aliases: [],
      },
    }),
  )
  await writeFile(
    join(dir, 'homeserver.yaml'),
    JSON.stringify({
      server_name: 'week1.test',
      public_baseurl: 'http://localhost:8008/',
      report_stats: false,
      pid_file: '/data/homeserver.pid',
      signing_key_path: '/data/signing.key',
      database: { name: 'sqlite3', args: { database: '/data/homeserver.db' } },
      media_store_path: '/data/media',
      trusted_key_servers: [],
      federation_domain_whitelist: [],
      listeners: [
        {
          port: 8008,
          tls: false,
          type: 'http',
          bind_addresses: ['0.0.0.0'],
          resources: [{ names: ['client'], compress: false }],
        },
      ],
      app_service_config_files: ['/data/registration.yaml'],
      suppress_key_server_warning: true,
    }),
  )
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '-p',
      '127.0.0.1::8008',
      '-v',
      `${dir}:/data`,
      'matrixdotorg/synapse:v1.161.0',
    ],
    { stdio: 'pipe' },
  )
  active = true
  const mapped = execFileSync('docker', ['port', name, '8008'], {
    encoding: 'utf8',
  }).trim()
  const base = `http://${mapped}`
  let ready = false
  for (let n = 0; n < 100; n++) {
    try {
      ready = (await fetch(`${base}/_matrix/client/versions`)).ok
    } catch {}
    if (ready) break
    await delay(300)
  }
  assert(ready, 'isolated Synapse did not start')
  const matrix = async (
    path: string,
    body: unknown,
    method = 'POST',
    token = asToken,
  ) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    assert(response.ok, `Matrix request failed: ${response.status} ${path}`)
    return response.json() as Promise<Record<string, string>>
  }
  const { room_id: roomId } = await matrix('/_matrix/client/v3/createRoom', {
    preset: 'private_chat',
    name: 'Week 1 isolated test',
  })
  await db.setSpaceForCommunity('at://smoke/community/test', roomId, 'smoke')
  await db.setCommunityMembership(
    'did:plc:smoke',
    'at://smoke/community/test',
    'active',
  )
  const stream = await fetch(`http://127.0.0.1:${port}/api/events`, {
    headers: { Authorization: 'Bearer isolated-smoke' },
    signal: abort.signal,
  })
  const reader = stream.body!.getReader()
  let sse = ''
  const reading = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sse += new TextDecoder().decode(value)
      }
    } catch {}
  })()
  const { event_id: eventId } = await matrix(
    `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/smoke`,
    { msgtype: 'm.text', body: 'isolated synthetic smoke message' },
    'PUT',
  )
  for (let n = 0; n < 100; n++) {
    if ((await db.eventExists(eventId)) && sse.includes('event: chat.unread'))
      break
    await delay(200)
  }
  assert(await db.eventExists(eventId), 'Synapse did not push the client event')
  assert(
    sse.includes('event: chat.unread'),
    'SSE did not deliver unread invalidation',
  )
  assert(
    !sse.includes('isolated synthetic smoke message'),
    'SSE exposed message content',
  )
  const before = await db.getMaxEventSeq()
  assert(lastTransaction)
  const duplicate = await fetch(
    `http://127.0.0.1:${port}${lastTransaction.url}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${hsToken}` },
      body: lastTransaction.body,
    },
  )
  assert.equal(duplicate.status, 200)
  assert.equal(await db.getMaxEventSeq(), before)
  abort.abort()
  await reading
  console.log(
    'PASS: client -> isolated Synapse -> appservice -> durable metadata + SSE; duplicate transaction has no effects',
  )
} finally {
  abort.abort()
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await db.close()
  if (active) execFileSync('docker', ['stop', name], { stdio: 'pipe' })
  await rm(dir, { recursive: true, force: true })
}
