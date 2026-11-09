import type { IncomingMessage, ServerResponse } from 'node:http'

// Browser clients send a bearer token and a JSON body; nothing else.
const ALLOWED_METHODS = 'GET, POST'
const ALLOWED_HEADERS = 'Authorization, Content-Type'
const PREFLIGHT_MAX_AGE_SECONDS = '600'

/**
 * Parse `BRIDGE_CORS_ORIGINS`: a comma-separated list of exact origins
 * (scheme, host and optional port, no path). A wildcard or anything that is
 * not a bare origin is a configuration error, not something to guess at.
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      let origin: string
      try {
        origin = new URL(value).origin
      } catch {
        throw new Error(`BRIDGE_CORS_ORIGINS: invalid origin "${value}"`)
      }
      if (origin === 'null' || origin !== value.replace(/\/$/, '')) {
        throw new Error(
          `BRIDGE_CORS_ORIGINS: "${value}" must be a bare origin such as https://para.social`,
        )
      }
      return origin
    })
}

/**
 * Let the configured web origins call the API from a browser. The bridge
 * authenticates with bearer tokens, never cookies, so it does not allow
 * credentials, and an origin outside the list gets no CORS headers at all
 * (the browser then refuses to expose the response).
 *
 * Returns true when it answered a preflight and the request is finished.
 */
export function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  allowedOrigins: readonly string[],
): boolean {
  if (allowedOrigins.length === 0) return false
  // Responses differ by Origin, so shared caches must key on it.
  res.setHeader('Vary', 'Origin')
  const origin = req.headers.origin
  if (!origin || !allowedOrigins.includes(origin)) return false
  res.setHeader('Access-Control-Allow-Origin', origin)

  const isPreflight =
    req.method === 'OPTIONS' && !!req.headers['access-control-request-method']
  if (!isPreflight) return false
  res.writeHead(204, {
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': PREFLIGHT_MAX_AGE_SECONDS,
  })
  res.end()
  return true
}
