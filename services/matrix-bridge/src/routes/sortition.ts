import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { AI_CONSENT_POLICY_VERSION } from '../ai-consent.js'
import { authenticateM8 } from '../m8-auth.js'
import { fetchBeacon, fetchLatestBeacon } from '../drand.js'
import { extractFromText, persistExtractedCard } from '../extraction.js'
import { OpenAIClient } from '../openai-client.js'
import { summarizeCommunityDeliberation } from '../summarize.js'
import { formatSortitionCandidate, formatSortitionRun, type SortitionRunRow } from '../sortition-runs.js'
import { sendExpoNotifications } from '../push.js'
import type { RouteContext } from './context.js'
import { readBody, writeJson } from './http.js'

/** POST /api/sortition/runs */
export async function apiSortitionRunsPOSTHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const {
        cabildeoUri,
        communityUri,
        assemblySize = 100,
        eligibilityFilter = 'all',
        drandRound,
        roundOffset = 20,
      } = JSON.parse(body)
      if (!cabildeoUri || !communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'Missing cabildeoUri or communityUri',
          }),
        )
        return
      }
      const existing = await ctx.db.getSortitionRunByCabildeo(cabildeoUri)
      if (existing) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'Sortition already configured for this Cabildeo',
            run: formatSortitionRun(existing),
          }),
        )
        return
      }
      const size = Number(assemblySize)
      if (![50, 100, 500].includes(size)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ error: 'Assembly size must be 50, 100, or 500' }),
        )
        return
      }
      const filter = ['all', 'verified', 'senior'].includes(eligibilityFilter)
        ? eligibilityFilter
        : 'all'
      const latest = Number(drandRound) > 0 ? null : await fetchLatestBeacon()
      const targetRound =
        Number(drandRound) > 0
          ? Number(drandRound)
          : (latest?.round ?? 0) + Math.max(1, Number(roundOffset) || 20)
      const now = new Date().toISOString()
      const configRecord = {
        $type: 'com.para.governance.sortitionConfig',
        cabildeo: cabildeoUri,
        community: communityUri,
        createdBy: auth.did,
        assemblySize: size,
        eligibilityFilter: filter,
        drandRound: targetRound,
        createdAt: now,
      }
      const run = await ctx.db.createSortitionRun({
        id: randomUUID(),
        cabildeoUri,
        communityUri,
        createdByDid: auth.did,
        assemblySize: size,
        eligibilityFilter: filter,
        drandRound: targetRound,
        configRecordJson: JSON.stringify(configRecord),
        createdAt: now,
      })
      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ run: formatSortitionRun(run) }))
    
}

/** GET /api/sortition/runs (prefix) */
export async function apiSortitionRunsGETHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const cabildeoUri = url.searchParams.get('cabildeo')
      const viewerDid = url.searchParams.get('viewerDid')
      if (!cabildeoUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing cabildeo parameter' }))
        return
      }
      const run = (await ctx.db.getSortitionRunByCabildeo(cabildeoUri)) as
        SortitionRunRow | undefined
      if (!run) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Sortition run not found' }))
        return
      }
      const selected = (await ctx.db.getSortitionCandidates(run.id, true)).map(
        formatSortitionCandidate,
      )
      const viewerCandidate = viewerDid
        ? formatSortitionCandidate(
            await ctx.db.getSortitionCandidate(run.id, viewerDid),
          )
        : null
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          run: formatSortitionRun(run),
          selected,
          viewerCandidate,
        }),
      )
    
}

/** POST /api/sortition/runs/process (prefix) */
export async function apiSortitionRunsProcessHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { runId } = JSON.parse(body)
      if (!runId) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing runId' }))
        return
      }
      const run = await ctx.db.getSortitionRun(runId)
      if (!run) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Sortition run not found' }))
        return
      }
      if (!(await ctx.db.isActiveCommunityMember(auth.did, run.community_uri))) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: 'Only community members can process sortitions',
          }),
        )
        return
      }
      const result = await ctx.sortition.processRun(runId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    
}

/** GET /api/sortition-proofs (prefix) */
export async function apiSortitionProofsHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const communityUri = url.searchParams.get('community')
      if (!communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing community parameter' }))
        return
      }
      const proofs = await ctx.db.getSortitionProofsByCommunity(communityUri)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ proofs }))
    
}

/** GET /api/sortition-proof (prefix) */
export async function apiSortitionProofHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const did = url.searchParams.get('did')
      const communityUri = url.searchParams.get('community')
      if (!did || !communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ error: 'Missing did or community parameter' }),
        )
        return
      }
      const proof = await ctx.db.getSortitionProof(did, communityUri)
      if (!proof) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Sortition proof not found' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          did: proof.did,
          communityUri: proof.community_uri,
          chamber: proof.chamber,
          drandRound: proof.drand_round,
          drandRandomness: proof.drand_randomness,
          hashInput: proof.hash_input,
          hashOutput: proof.hash_output,
          timestamp: proof.timestamp,
          verified: proof.verified === 1,
        }),
      )
    
}

/** POST /api/verify-sortition */
export async function apiVerifySortitionHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { did, communityUri, round, randomness } = JSON.parse(body)
      if (!did || !communityUri || !round || !randomness) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Missing required fields' }))
        return
      }
      const stored = await ctx.db.getSortitionProof(did, communityUri)
      if (!stored) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'No stored proof found' }))
        return
      }
      const matches =
        stored.drand_round === round &&
        stored.drand_randomness === randomness &&
        stored.verified === 1
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          valid: matches,
          storedRound: stored.drand_round,
          providedRound: round,
          chamber: stored.chamber,
        }),
      )
    
}

/** GET /api/sortition-proof-as-record (prefix) */
export async function apiSortitionProofAsRecordHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      await authenticateM8(req, ctx.config)
      const url = new URL(req.url ?? '', `http://localhost:${ctx.config.port}`)
      const did = url.searchParams.get('did')
      const communityUri = url.searchParams.get('community')
      if (!did || !communityUri) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ error: 'Missing did or community parameter' }),
        )
        return
      }
      const stored = await ctx.db.getSortitionProof(did, communityUri)
      if (!stored) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Sortition proof not found' }))
        return
      }
      // Return the proof as a ready-to-publish AT Protocol record
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          $type: 'com.para.sortition.proof',
          did: stored.did,
          community: stored.community_uri,
          chamber: stored.chamber,
          drandRound: stored.drand_round,
          drandRandomness: stored.drand_randomness,
          hashInput: stored.hash_input,
          hashOutput: stored.hash_output,
          threshold: stored.threshold,
          timestamp: stored.timestamp,
          // Usage: POST to your PDS at /xrpc/com.atproto.repo.createRecord
          // with collection: 'com.para.sortition.proof' and this object as record
        }),
      )
    
}
