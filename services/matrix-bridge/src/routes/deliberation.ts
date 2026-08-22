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

/** POST /api/cards */
export async function apiCardsPOSTHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const {
        communityUri,
        authorDid,
        title,
        content,
        cardType,
        sourceUrl,
        isPublic,
        passportVisible,
        metadata,
      } = JSON.parse(body)
      if (!communityUri || !authorDid || !title) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'Missing communityUri, authorDid, or title',
          }),
        )
        return
      }
      if (auth.did !== authorDid) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'authorDid must match authenticated DID',
          }),
        )
        return
      }
      const id = crypto.randomUUID()
      await ctx.db.insertCard({
        id,
        communityUri,
        authorDid,
        title,
        content,
        cardType: cardType || 'claim',
        sourceUrl,
        isPublic: isPublic ? 1 : 0,
        passportVisible: passportVisible ? 1 : 0,
        metadata,
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ id }))
    
}

/** GET /api/cards (prefix) */
export async function apiCardsGETHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('community')
      if (!communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing community parameter' }))
        return
      }
      const cards = await ctx.db.getCardsForCommunity(communityUri)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ cards }))
    
}

/** POST /api/community-tree/contributions */
export async function apiCommunityTreeContributionsPOSTHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const {
        communityUri,
        authorDid,
        title,
        content,
        sourceUrl,
        sourceType,
        metadata,
      } = JSON.parse(body)
      if (!communityUri || !authorDid || !title || !sourceType) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'Missing communityUri, authorDid, title, or sourceType',
          }),
        )
        return
      }
      if (auth.did !== authorDid) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'authorDid must match authenticated DID',
          }),
        )
        return
      }
      const id = crypto.randomUUID()
      await ctx.db.insertCommunityMapContribution({
        id,
        communityUri,
        authorDid,
        title,
        content,
        sourceUrl,
        sourceType,
        metadata,
      })
      const contribution = await ctx.db.getCommunityMapContribution(id, authorDid)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ contribution }))
    
}

/** GET /api/community-tree/contributions (prefix) */
export async function apiCommunityTreeContributionsGETHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('community')
      const status = url.searchParams.get('status') || 'pending'
      const viewerDid = url.searchParams.get('viewer') || undefined
      if (!communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing community parameter' }))
        return
      }
      const contributions = await ctx.db.getCommunityMapContributions(
        communityUri,
        {
          status,
          viewerDid,
          limit: 50,
        },
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ contributions }))
    
}

/** POST /api/community-tree/contributions/vote */
export async function apiCommunityTreeContributionsVoteHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { contributionId, voterDid, vote } = JSON.parse(body)
      if (
        !contributionId ||
        !voterDid ||
        !['approve', 'reject'].includes(vote)
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'Missing contributionId, voterDid, or valid vote',
          }),
        )
        return
      }
      if (auth.did !== voterDid) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'voterDid must match authenticated DID',
          }),
        )
        return
      }
      const contribution = await ctx.db.voteCommunityMapContribution(
        contributionId,
        voterDid,
        vote,
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ contribution }))
    
}

/** POST /api/relationships */
export async function apiRelationshipsHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { sourceCardId, targetCardId, relationshipType, authorDid } =
        JSON.parse(body)
      if (!sourceCardId || !targetCardId || !relationshipType || !authorDid) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing required fields' }))
        return
      }
      if (auth.did !== authorDid) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'authorDid must match authenticated DID',
          }),
        )
        return
      }
      const validTypes = [
        'supports',
        'opposes',
        'addresses',
        'helpful',
        'explainer',
        'compares_to',
      ]
      if (!validTypes.includes(relationshipType)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: `Invalid relationshipType. Must be one of: ${validTypes.join(', ')}`,
          }),
        )
        return
      }
      const id = crypto.randomUUID()
      await ctx.db.insertRelationship({
        id,
        sourceCardId,
        targetCardId,
        relationshipType,
        authorDid,
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ id }))
    
}

/** GET /api/graph (prefix) */
export async function apiGraphHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('community')
      if (!communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing community parameter' }))
        return
      }
      const graph = await ctx.db.getGraphForCommunity(communityUri)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(graph))
    
}

/** GET /api/suggestions (prefix) */
export async function apiSuggestionsHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('community')
      const status = url.searchParams.get('status') || 'pending'
      if (!communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing community parameter' }))
        return
      }
      const suggestions = await ctx.db.getSuggestionsForCommunity(communityUri, {
        status,
        limit: 50,
      })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ suggestions }))
    
}

/** POST /api/suggestions/accept */
export async function apiSuggestionsAcceptHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { id, authorDid } = JSON.parse(body)
      if (!id || !authorDid) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing id or authorDid' }))
        return
      }
      if (auth.did !== authorDid) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'authorDid must match authenticated DID',
          }),
        )
        return
      }
      await ctx.db.acceptSuggestion(id, authorDid)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    
}

/** POST /api/suggestions/reject */
export async function apiSuggestionsRejectHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { id } = JSON.parse(body)
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing id' }))
        return
      }
      await ctx.db.rejectSuggestion(id)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    
}

/** GET /api/summarize (prefix) */
export async function apiSummarizeHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('community')
      if (!communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing community parameter' }))
        return
      }
      if (!ctx.config.openaiApiKey) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'LLM summarization not configured' }))
        return
      }
      const client = new OpenAIClient(
        ctx.config.openaiApiKey,
        ctx.config.openaiModel || 'gpt-4o-mini',
      )
      const summary = await summarizeCommunityDeliberation(
        client,
        ctx.db,
        communityUri,
      )
      if (!summary) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not enough claims to summarize' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(summary))
    
}

/** POST /api/vote */
export async function apiVoteHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { cardId, voterDid, influence } = JSON.parse(body)
      if (!cardId || !voterDid || typeof influence !== 'number') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ error: 'Missing cardId, voterDid, or influence' }),
        )
        return
      }
      if (auth.did !== voterDid) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'voterDid must match authenticated DID',
          }),
        )
        return
      }
      if (influence < -3 || influence > 3) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ error: 'Influence must be between -3 and +3' }),
        )
        return
      }
      await ctx.db.upsertCardVote(cardId, voterDid, influence)
      const votes = await ctx.db.getCardVotes(cardId)
      const totalInfluence = votes.reduce(
        (sum: number, v: { influence: number }) => sum + v.influence,
        0,
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          success: true,
          totalInfluence,
          voteCount: votes.length,
        }),
      )
    
}

/** GET /api/votes (prefix) */
export async function apiVotesHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const cardId = url.searchParams.get('card')
      if (!cardId) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing card parameter' }))
        return
      }
      const voterDid = url.searchParams.get('voter')
      if (voterDid) {
        const vote = await ctx.db.getCardVote(cardId, voterDid)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ vote: vote ?? null }))
      } else {
        const votes = await ctx.db.getCardVotes(cardId)
        const totalInfluence = votes.reduce(
          (sum: number, v: { influence: number }) => sum + v.influence,
          0,
        )
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ votes, totalInfluence, voteCount: votes.length }),
        )
      }
    
}

/** GET /api/community-pulse (prefix) */
export async function apiCommunityPulseHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('community')
      const voterDid = url.searchParams.get('voter') || undefined
      if (!communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing community parameter' }))
        return
      }
      const pulse = await ctx.db.getCommunityPulse(communityUri, voterDid)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(pulse))
    
}

/** POST /api/extract */
export async function apiExtractHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { text, communityUri, authorDid } = JSON.parse(body)
      if (!text || !communityUri || !authorDid) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'Missing text, communityUri, or authorDid',
          }),
        )
        return
      }
      if (auth.did !== authorDid) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'authorDid must match authenticated DID',
          }),
        )
        return
      }
      const extracted = extractFromText(text, { communityUri })
      if (extracted) {
        await persistExtractedCard(ctx.db, extracted, { communityUri, authorDid })
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ extracted }))
    
}
