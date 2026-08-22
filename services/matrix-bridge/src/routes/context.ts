import type { IncomingMessage, ServerResponse } from 'node:http'
import type pino from 'pino'

import type { Config } from '../config.js'
import type { IBridgeDatabase } from '../db/index.js'
import type { ChatModerationEngine } from '../chat-moderation.js'
import type { MatrixAdminClient } from '../matrix.js'
import type { BridgeMetrics } from '../metrics.js'
import type { ProposalEngine } from '../proposals.js'
import type { SortitionEngine } from '../sortition-runs.js'

/**
 * Everything a route handler may touch, injected by main(). No module-level
 * singletons: the wiring stays visible in one place.
 */
export interface RouteContext {
  config: Config
  db: IBridgeDatabase
  matrix: MatrixAdminClient
  metrics: BridgeMetrics
  log: pino.Logger
  chatMod: ChatModerationEngine
  proposals: ProposalEngine
  sortition: SortitionEngine
}

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
) => Promise<void>
