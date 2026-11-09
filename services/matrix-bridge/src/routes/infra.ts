import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RouteContext } from './context.js'

/** ANY /healthz */
export async function healthzHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const failedSyncs = await ctx.db.getFailedSyncs(5)
  const healthy = failedSyncs.length < 10
  res.writeHead(healthy ? 200 : 503, {
    'Content-Type': 'application/json',
  })
  res.end(
    JSON.stringify({
      status: healthy ? 'ok' : 'degraded',
      failedSyncs: failedSyncs.length,
      recentFailures: failedSyncs.map((f) => ({
        event: f.eventType,
        community: f.communityUri,
        error: f.error,
      })),
    }),
  )
}

/** ANY /metrics */
export async function metricsHandler(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const metricString = await ctx.metrics.registry.metrics()
  res.writeHead(200, { 'Content-Type': ctx.metrics.registry.contentType })
  res.end(metricString)
}
