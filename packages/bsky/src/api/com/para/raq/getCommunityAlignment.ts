// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

const isCompassPosition = (
  value: unknown,
): value is { x: number; y: number; ninth: string } => {
  if (!value || typeof value !== 'object') return false
  const { x, y, ninth } = value as Record<string, unknown>
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    Math.abs(x as number) <= 1000 &&
    Math.abs(y as number) <= 1000 &&
    typeof ninth === 'string' &&
    ninth.length > 0 &&
    ninth.length <= 64
  )
}

export default function (server: Server, ctx: AppContext) {
  server.com.para.raq.getCommunityAlignment({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaCommunityAlignment({
        community: params.community,
        limit: params.limit,
        viewerDid: viewer ?? '',
      })

      if (!res.axesJson) {
        throw new InvalidRequestError(
          'Community alignment not found',
          'NotFound',
        )
      }

      let axes: unknown[] = []
      let compass: unknown
      try {
        axes = JSON.parse(res.axesJson)
        if (res.compassJson) {
          compass = JSON.parse(res.compassJson)
        }
      } catch {
        throw new InvalidRequestError(
          'Community alignment not found',
          'NotFound',
        )
      }

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: {
          axes: Array.isArray(axes) ? axes : [],
          // `compass` is optional. The data plane sends `{}` when a community has
          // no answers yet, which is not a valid position, and inventing a
          // "center" would present no data as a real result.
          ...(isCompassPosition(compass) ? { compass } : {}),
          participantCount: res.participantCount,
          cursor: res.cursor,
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}
