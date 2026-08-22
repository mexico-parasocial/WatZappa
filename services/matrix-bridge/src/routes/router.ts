import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RouteContext } from './context.js'

import { healthzHandler, metricsHandler } from './infra.js'
import { apiSpaceForCommunityHandler, apiMatrixTokenHandler, apiPushTokenHandler, apiMarkReadHandler, apiUnreadHandler, apiRoomsHandler } from './matrix-identity.js'
import { matrixPushV1NotifyHandler } from './push.js'
import { apiSortitionRunsPOSTHandler, apiSortitionRunsGETHandler, apiSortitionRunsProcessHandler, apiSortitionProofsHandler, apiSortitionProofHandler, apiVerifySortitionHandler, apiSortitionProofAsRecordHandler } from './sortition.js'
import { apiConstitutionHandler, apiProposalsHandler, apiDecisionsHandler } from './governance-read.js'
import { apiChatBadgesHandler, apiChatMemberListHandler, apiModerationReportHandler, apiModerationSanctionHandler, apiModerationDashboardHandler, apiModerationRecomputeHandler, apiUserChatPreferencesGETHandler, apiUserChatPreferencesPOSTHandler } from './moderation.js'
import { apiAiConsentGETHandler, apiAiConsentPOSTHandler } from './consent.js'
import { apiCardsPOSTHandler, apiCardsGETHandler, apiCommunityTreeContributionsPOSTHandler, apiCommunityTreeContributionsGETHandler, apiCommunityTreeContributionsVoteHandler, apiRelationshipsHandler, apiGraphHandler, apiSuggestionsHandler, apiSuggestionsAcceptHandler, apiSuggestionsRejectHandler, apiSummarizeHandler, apiVoteHandler, apiVotesHandler, apiCommunityPulseHandler, apiExtractHandler } from './deliberation.js'

type Route = {
  urls: string[]
  prefix: boolean
  method: string | null
  handler: (req: IncomingMessage, res: ServerResponse, ctx: RouteContext) => Promise<void>
}

/** Order matters: it reproduces the original if/else chain exactly. */
const ROUTES: Route[] = [
  { urls: ['/healthz'], prefix: false, method: null, handler: healthzHandler },
  { urls: ['/metrics'], prefix: false, method: null, handler: metricsHandler },
  { urls: ['/api/space-for-community'], prefix: true, method: null, handler: apiSpaceForCommunityHandler },
  { urls: ['/api/matrix-token'], prefix: false, method: 'POST', handler: apiMatrixTokenHandler },
  { urls: ['/api/push-token'], prefix: false, method: 'POST', handler: apiPushTokenHandler },
  { urls: ['/_matrix/push/v1/notify'], prefix: false, method: 'POST', handler: matrixPushV1NotifyHandler },
  { urls: ['/api/mark-read'], prefix: false, method: 'POST', handler: apiMarkReadHandler },
  { urls: ['/api/unread'], prefix: true, method: 'GET', handler: apiUnreadHandler },
  { urls: ['/api/rooms'], prefix: false, method: 'GET', handler: apiRoomsHandler },
  { urls: ['/api/sortition/runs'], prefix: false, method: 'POST', handler: apiSortitionRunsPOSTHandler },
  { urls: ['/api/sortition/runs'], prefix: true, method: 'GET', handler: apiSortitionRunsGETHandler },
  { urls: ['/api/sortition/runs/process'], prefix: true, method: 'POST', handler: apiSortitionRunsProcessHandler },
  { urls: ['/api/sortition-proofs'], prefix: true, method: 'GET', handler: apiSortitionProofsHandler },
  { urls: ['/api/sortition-proof'], prefix: true, method: 'GET', handler: apiSortitionProofHandler },
  { urls: ['/api/verify-sortition'], prefix: false, method: 'POST', handler: apiVerifySortitionHandler },
  { urls: ['/api/sortition-proof-as-record'], prefix: true, method: 'GET', handler: apiSortitionProofAsRecordHandler },
  { urls: ['/api/constitution'], prefix: true, method: 'GET', handler: apiConstitutionHandler },
  { urls: ['/api/proposals'], prefix: true, method: 'GET', handler: apiProposalsHandler },
  { urls: ['/api/decisions'], prefix: true, method: 'GET', handler: apiDecisionsHandler },
  { urls: ['/api/chat-badges'], prefix: true, method: 'GET', handler: apiChatBadgesHandler },
  { urls: ['/api/chat-member-list'], prefix: true, method: 'GET', handler: apiChatMemberListHandler },
  { urls: ['/api/moderation-report'], prefix: false, method: 'POST', handler: apiModerationReportHandler },
  { urls: ['/api/moderation-sanction'], prefix: false, method: 'POST', handler: apiModerationSanctionHandler },
  { urls: ['/api/moderation-dashboard'], prefix: true, method: 'GET', handler: apiModerationDashboardHandler },
  { urls: ['/api/moderation-recompute'], prefix: false, method: 'POST', handler: apiModerationRecomputeHandler },
  { urls: ['/api/user-chat-preferences'], prefix: true, method: 'GET', handler: apiUserChatPreferencesGETHandler },
  { urls: ['/api/user-chat-preferences'], prefix: false, method: 'POST', handler: apiUserChatPreferencesPOSTHandler },
  { urls: ['/api/ai-consent'], prefix: false, method: 'GET', handler: apiAiConsentGETHandler },
  { urls: ['/api/ai-consent'], prefix: false, method: 'POST', handler: apiAiConsentPOSTHandler },
  { urls: ['/api/cards'], prefix: false, method: 'POST', handler: apiCardsPOSTHandler },
  { urls: ['/api/cards'], prefix: true, method: 'GET', handler: apiCardsGETHandler },
  { urls: ['/api/community-tree/contributions', '/api/community-map/contributions'], prefix: false, method: 'POST', handler: apiCommunityTreeContributionsPOSTHandler },
  { urls: ['/api/community-tree/contributions', '/api/community-map/contributions'], prefix: true, method: 'GET', handler: apiCommunityTreeContributionsGETHandler },
  { urls: ['/api/community-tree/contributions/vote', '/api/community-map/contributions/vote'], prefix: false, method: 'POST', handler: apiCommunityTreeContributionsVoteHandler },
  { urls: ['/api/relationships'], prefix: false, method: 'POST', handler: apiRelationshipsHandler },
  { urls: ['/api/graph'], prefix: true, method: 'GET', handler: apiGraphHandler },
  { urls: ['/api/suggestions'], prefix: true, method: 'GET', handler: apiSuggestionsHandler },
  { urls: ['/api/suggestions/accept'], prefix: false, method: 'POST', handler: apiSuggestionsAcceptHandler },
  { urls: ['/api/suggestions/reject'], prefix: false, method: 'POST', handler: apiSuggestionsRejectHandler },
  { urls: ['/api/summarize'], prefix: true, method: 'GET', handler: apiSummarizeHandler },
  { urls: ['/api/vote'], prefix: false, method: 'POST', handler: apiVoteHandler },
  { urls: ['/api/votes'], prefix: true, method: 'GET', handler: apiVotesHandler },
  { urls: ['/api/community-pulse'], prefix: true, method: 'GET', handler: apiCommunityPulseHandler },
  { urls: ['/api/extract'], prefix: false, method: 'POST', handler: apiExtractHandler },
]

export async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<boolean> {
  const url = req.url ?? ''
  for (const route of ROUTES) {
    const urlMatches = route.prefix
      ? route.urls.some((u) => url.startsWith(u))
      : route.urls.includes(url)
    if (urlMatches && (route.method === null || req.method === route.method)) {
      await route.handler(req, res, ctx)
      return true
    }
  }
  return false
}

export function writeJsonFallback(res: import("node:http").ServerResponse): void {
  res.writeHead(404)
  res.end("Not found")
}
