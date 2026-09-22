import type { IncomingMessage, ServerResponse } from 'node:http'
import { HttpError } from '../m8-auth.js'

/** Read an identity-encoded JSON body with a hard byte budget. */
export async function readBody(
  req: IncomingMessage,
  maxBytes = 1024 * 1024,
): Promise<string> {
  const encoding = req.headers['content-encoding']
  if (encoding && encoding !== 'identity')
    throw new HttpError(415, 'Unsupported content encoding')
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > maxBytes) {
      req.resume()
      throw new HttpError(413, 'Request body too large')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function writeJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
