import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../config.js'
import { applyCors, parseCorsOrigins } from '../cors.js'

const WEB = 'http://localhost:19006'

let server: Server | undefined

afterEach(async () => {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  )
  server = undefined
  delete process.env.BRIDGE_CORS_ORIGINS
})

/** A stand-in for the bridge server: CORS first, then a JSON route. */
async function serve(allowed: string[]): Promise<string> {
  server = createServer((req, res) => {
    if (applyCors(req, res, allowed)) return
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"rooms":[]}')
  })
  await new Promise<void>((resolve) => server!.listen(0, resolve))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`
}

function preflight(base: string, origin: string) {
  return fetch(`${base}/api/rooms`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  })
}

describe(applyCors, () => {
  it('answers a preflight from an allowed origin', async () => {
    const res = await preflight(await serve([WEB]), WEB)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB)
    expect(res.headers.get('access-control-allow-headers')).toMatch(
      /Authorization/,
    )
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('marks actual responses for an allowed origin', async () => {
    const res = await fetch(`${await serve([WEB])}/api/rooms`, {
      headers: { Origin: WEB },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB)
    expect(res.headers.get('vary')).toBe('Origin')
  })

  it('gives an unlisted origin no CORS headers and no preflight answer', async () => {
    const base = await serve([WEB])
    const res = await preflight(base, 'https://evil.example')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.status).not.toBe(204)
  })

  it('does nothing when no origins are configured', async () => {
    const res = await preflight(await serve([]), WEB)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('vary')).toBeNull()
  })
})

describe(parseCorsOrigins, () => {
  it('reads a comma-separated list of origins', () => {
    expect(
      parseCorsOrigins(' https://para.social, http://localhost:19006/ '),
    ).toEqual(['https://para.social', 'http://localhost:19006'])
  })

  it('is empty when unset', () => {
    expect(parseCorsOrigins(undefined)).toEqual([])
    expect(parseCorsOrigins('  ')).toEqual([])
  })

  it('refuses a wildcard, a path or a non-URL', () => {
    expect(() => parseCorsOrigins('*')).toThrow(/BRIDGE_CORS_ORIGINS/)
    expect(() => parseCorsOrigins('https://para.social/app')).toThrow(
      /bare origin/,
    )
    expect(() => parseCorsOrigins('para.social')).toThrow(/BRIDGE_CORS_ORIGINS/)
  })

  it('is loaded into the bridge config', () => {
    process.env.BRIDGE_CORS_ORIGINS = WEB
    process.env.MATRIX_ADMIN_TOKEN ??= 'test-token'
    expect(loadConfig().corsAllowedOrigins).toEqual([WEB])
  })
})
