#!/usr/bin/env node
/**
 * Minimal M8 stub for local stacks and smoke tests.
 *
 * Answers GET /v1/sessions/me (and /sessions/me) with a fixed session for
 * any bearer token of the form `smoke-*` — the matrix-bridge's only M8
 * interaction. Not for production.
 *
 *   node scripts/m8-stub/server.mjs [port]   # default 8788
 */
import { createServer } from 'node:http'

const port = parseInt(process.argv[2] ?? '8788', 10)
const DID = process.env.M8_STUB_DID ?? 'did:plc:smoketest000000000000000'

const server = createServer((req, res) => {
  const json = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.url?.endsWith('/sessions/me') && req.method === 'GET') {
    const auth = req.headers.authorization ?? ''
    if (!auth.startsWith('Bearer ')) return json(401, { error: 'missing token' })
    return json(200, { session: { did: DID, sessionId: 'smoke-session' } })
  }
  return json(404, { error: 'not found' })
})

server.listen(port, '0.0.0.0', () => {
  console.log(`m8-stub listening on :${port} (did=${DID})`)
})
