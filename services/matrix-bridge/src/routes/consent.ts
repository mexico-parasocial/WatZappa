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

/** GET /api/ai-consent */
export async function apiAiConsentGETHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const record = await ctx.db.getAiConsent(auth.did)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          granted: record.granted,
          policyVersion: record.policyVersion,
          grantedAt: record.grantedAt,
          revokedAt: record.revokedAt,
          // Consent recorded against an older disclosure does not carry over;
          // the client should re-ask when this is true.
          needsRenewal:
            record.granted &&
            record.policyVersion < AI_CONSENT_POLICY_VERSION,
          currentPolicyVersion: AI_CONSENT_POLICY_VERSION,
        }),
      )
    
}

/** POST /api/ai-consent */
export async function apiAiConsentPOSTHandler(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
      const auth = await authenticateM8(req, ctx.config)
      const body = await readBody(req)
      const { granted, did } = JSON.parse(body)
      if (typeof granted !== 'boolean') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'granted must be a boolean' }))
        return
      }
      if (did !== undefined && did !== auth.did) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'did must match authenticated DID' }))
        return
      }
      await ctx.db.setAiConsent(auth.did, granted, AI_CONSENT_POLICY_VERSION)
      ctx.log.info(
        { did: auth.did, granted, policyVersion: AI_CONSENT_POLICY_VERSION },
        'AI processing consent updated',
      )
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          ok: true,
          granted,
          policyVersion: AI_CONSENT_POLICY_VERSION,
        }),
      )

      // ── Deliberation / Knowledge Graph API ──
    
}
