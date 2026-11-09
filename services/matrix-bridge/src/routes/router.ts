import type { IncomingMessage, ServerResponse } from 'node:http'
import { writeChatDisabled } from '../chat-mode.js'
import { appServiceTransactionHandler } from './appservice-txn.js'
import type { RouteContext } from './context.js'
import {
  apiDmRequestAcceptHandler,
  apiDmRequestCreateHandler,
  apiDmRequestDeclineHandler,
  apiDmRequestListHandler,
} from './dm-requests.js'
import { apiEventsSseHandler } from './events.js'
import { apiConstitutionHandler } from './governance-read.js'
import { healthzHandler, metricsHandler } from './infra.js'
import {
  apiCommunityJoinHandler,
  apiListDevicesHandler,
  apiMarkReadHandler,
  apiMatrixAttestHandler,
  apiMatrixChallengeHandler,
  apiMatrixIdentityGoneHandler,
  apiMatrixIdentityHandler,
  apiMatrixTokenHandler,
  apiPushTokenHandler,
  apiRevokeDeviceHandler,
  apiRoomsHandler,
  apiSpaceForCommunityHandler,
  apiUnreadHandler,
} from './matrix-identity.js'
import {
  apiChatBadgesHandler,
  apiChatMemberListHandler,
  apiModerationDashboardHandler,
  apiModerationDismissHandler,
  apiModerationLiftHandler,
  apiModerationRecomputeHandler,
  apiModerationReportHandler,
  apiModerationReportsHandler,
  apiModerationSanctionHandler,
  apiUserChatPreferencesGETHandler,
  apiUserChatPreferencesPOSTHandler,
} from './moderation.js'
import { matrixPushV1NotifyHandler } from './push.js'

type Route = {
  urls: string[]
  prefix: boolean
  method: string | null
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    ctx: RouteContext,
  ) => Promise<void>
  /** Matrix chat only: answers 503 CHAT_DISABLED when chat is off. */
  chat?: true
}

/** Order matters: it reproduces the original if/else chain exactly. */
const ROUTES: Route[] = [
  { urls: ['/healthz'], prefix: false, method: null, handler: healthzHandler },
  { urls: ['/metrics'], prefix: false, method: null, handler: metricsHandler },
  {
    urls: ['/api/space-for-community'],
    prefix: true,
    method: null,
    handler: apiSpaceForCommunityHandler,
    chat: true,
  },
  {
    urls: ['/api/matrix-challenge'],
    prefix: false,
    method: 'POST',
    handler: apiMatrixChallengeHandler,
    chat: true,
  },
  {
    urls: ['/api/matrix-identity'],
    prefix: false,
    method: 'GET',
    handler: apiMatrixIdentityGoneHandler,
    chat: true,
  },
  {
    urls: ['/api/matrix-identity'],
    prefix: false,
    method: 'POST',
    handler: apiMatrixIdentityHandler,
    chat: true,
  },
  {
    urls: ['/api/matrix-attest'],
    prefix: false,
    method: 'POST',
    handler: apiMatrixAttestHandler,
    chat: true,
  },
  {
    urls: ['/api/matrix-token'],
    prefix: false,
    method: 'POST',
    handler: apiMatrixTokenHandler,
    chat: true,
  },
  {
    urls: ['/api/community-join'],
    prefix: false,
    method: 'POST',
    handler: apiCommunityJoinHandler,
    chat: true,
  },
  {
    urls: ['/api/dm-requests'],
    prefix: false,
    method: 'POST',
    handler: apiDmRequestCreateHandler,
    chat: true,
  },
  {
    urls: ['/api/dm-requests'],
    prefix: false,
    method: 'GET',
    handler: apiDmRequestListHandler,
    chat: true,
  },
  {
    urls: ['/api/dm-requests/accept'],
    prefix: false,
    method: 'POST',
    handler: apiDmRequestAcceptHandler,
    chat: true,
  },
  {
    urls: ['/api/dm-requests/decline'],
    prefix: false,
    method: 'POST',
    handler: apiDmRequestDeclineHandler,
    chat: true,
  },
  {
    urls: ['/api/devices'],
    prefix: false,
    method: 'GET',
    handler: apiListDevicesHandler,
    chat: true,
  },
  {
    urls: ['/api/devices/revoke'],
    prefix: false,
    method: 'POST',
    handler: apiRevokeDeviceHandler,
    chat: true,
  },
  {
    urls: ['/api/push-token'],
    prefix: false,
    method: 'POST',
    handler: apiPushTokenHandler,
  },
  {
    urls: ['/_matrix/push/v1/notify'],
    prefix: false,
    method: 'POST',
    handler: matrixPushV1NotifyHandler,
    chat: true,
  },
  {
    urls: ['/api/mark-read'],
    prefix: false,
    method: 'POST',
    handler: apiMarkReadHandler,
    chat: true,
  },
  {
    urls: ['/api/unread'],
    prefix: true,
    method: 'GET',
    handler: apiUnreadHandler,
    chat: true,
  },
  {
    urls: ['/api/rooms'],
    prefix: false,
    method: 'GET',
    handler: apiRoomsHandler,
    chat: true,
  },
  {
    urls: ['/api/events'],
    prefix: false,
    method: 'GET',
    handler: apiEventsSseHandler,
  },
  // Appservice transaction push from Synapse (any /transactions/{id} path).
  {
    urls: ['/_matrix/app/unstable/transactions/'],
    prefix: true,
    method: null,
    handler: appServiceTransactionHandler,
    chat: true,
  },
  {
    urls: ['/_matrix/app/v1/transactions/'],
    prefix: true,
    method: null,
    handler: appServiceTransactionHandler,
    chat: true,
  },
  {
    urls: ['/api/constitution'],
    prefix: true,
    method: 'GET',
    handler: apiConstitutionHandler,
  },
  {
    urls: ['/api/chat-badges'],
    prefix: true,
    method: 'GET',
    handler: apiChatBadgesHandler,
  },
  {
    urls: ['/api/chat-member-list'],
    prefix: true,
    method: 'GET',
    handler: apiChatMemberListHandler,
  },
  {
    urls: ['/api/moderation-report'],
    prefix: false,
    method: 'POST',
    handler: apiModerationReportHandler,
  },
  {
    urls: ['/api/moderation-sanction'],
    prefix: false,
    method: 'POST',
    handler: apiModerationSanctionHandler,
  },
  {
    urls: ['/api/moderation-sanction-lift'],
    prefix: false,
    method: 'POST',
    handler: apiModerationLiftHandler,
  },
  {
    urls: ['/api/moderation-report-dismiss'],
    prefix: false,
    method: 'POST',
    handler: apiModerationDismissHandler,
  },
  {
    urls: ['/api/moderation-reports'],
    prefix: true,
    method: 'GET',
    handler: apiModerationReportsHandler,
  },
  {
    urls: ['/api/moderation-dashboard'],
    prefix: true,
    method: 'GET',
    handler: apiModerationDashboardHandler,
  },
  {
    urls: ['/api/moderation-recompute'],
    prefix: false,
    method: 'POST',
    handler: apiModerationRecomputeHandler,
  },
  {
    urls: ['/api/user-chat-preferences'],
    prefix: true,
    method: 'GET',
    handler: apiUserChatPreferencesGETHandler,
  },
  {
    urls: ['/api/user-chat-preferences'],
    prefix: false,
    method: 'POST',
    handler: apiUserChatPreferencesPOSTHandler,
  },
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
      if (route.chat && !ctx.config.matrixChatEnabled) {
        writeChatDisabled(res)
        return true
      }
      await route.handler(req, res, ctx)
      return true
    }
  }
  return false
}

export function writeJsonFallback(res: ServerResponse): void {
  res.writeHead(404)
  res.end('Not found')
}
