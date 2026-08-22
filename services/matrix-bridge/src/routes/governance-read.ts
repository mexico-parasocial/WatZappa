import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { AI_CONSENT_POLICY_VERSION } from '../ai-consent.js'
import { authenticateM8 } from '../m8-auth.js'
import { fetchBeacon, fetchLatestBeacon } from '../drand.js'
import { extractFromText, persistExtractedCard } from '../extraction.js'
import { OpenAIClient } from '../openai-client.js'
import { summarizeCommunityDeliberation } from '../summarize.js'
import type { SortitionRunRow } from '../sortition-runs.js'
import { sendExpoNotifications } from '../push.js'
import type { RouteContext } from './context.js'
import { readBody, writeJson } from './http.js'

/** GET /api/constitution (prefix) */
export async function apiConstitutionHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('uri')
      if (!communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing uri parameter' }))
        return
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

/** GET /api/proposals (prefix) */
export async function apiProposalsHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('community')
      const state = url.searchParams.get('state') || undefined
      if (!communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing community parameter' }))
        return
      }
      const items = await ctx.db.getProposalsByCommunity(communityUri, state)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ proposals: items }))
    
}

/** GET /api/decisions (prefix) */
export async function apiDecisionsHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('community')
      if (!communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing community parameter' }))
        return
      }
      const items = await ctx.db.getDecisionsByCommunity(communityUri)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ decisions: items }))
    
}
