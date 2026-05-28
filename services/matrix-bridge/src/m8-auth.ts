import type { IncomingMessage } from 'node:http'
import type { Config } from './config.js'

export type M8AuthenticatedSession = {
  did: string
  sessionId?: string
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

export function getBearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing M8 bearer token')
  }
  return header.slice('Bearer '.length).trim()
}

export async function authenticateM8(
  req: IncomingMessage,
  config: Config,
): Promise<M8AuthenticatedSession> {
  const token = getBearerToken(req)
  const url = `${config.m8BaseUrl.replace(/\/$/, '')}/sessions/me`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new HttpError(401, 'Invalid M8 bearer token')
  }
  const body = (await response.json()) as {
    session?: { did?: string; sessionId?: string }
  }
  const did = body.session?.did
  if (!did) {
    throw new HttpError(401, 'M8 session did not include a DID')
  }
  return { did, sessionId: body.session?.sessionId }
}
