import type { IncomingMessage, ServerResponse } from 'node:http'
import { authorize } from '../authz.js'
import { HttpError, authenticateM8 } from '../m8-auth.js'
import type { RouteContext } from './context.js'
import { writeJson } from './http.js'

/** GET /api/constitution (prefix) */
export async function apiConstitutionHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const auth = await authenticateM8(req, ctx.config)
  const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
  const communityUri = url.searchParams.get('uri')
  if (!communityUri) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing uri parameter' }))
    return
  }
  try {
    await authorize(ctx, auth.did, 'community.read', {
      kind: 'community',
      communityUri,
    })
  } catch (err) {
    if (err instanceof HttpError) {
      writeJson(res, err.statusCode, { error: err.message })
      return
    }
    throw err
  }
  const row = await ctx.db.getConstitution(communityUri)
  if (!row) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Constitution not found' }))
    return
  }
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      communityUri: row.communityUri,
      version: row.version,
      rules: JSON.parse(row.rulesJson),
      createdAt: row.createdAt,
    }),
  )
}
