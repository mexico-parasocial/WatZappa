// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.raq.getCommunityAlignment({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaCommunityAlignment({
        community: params.community,
        limit: params.limit,
        cursor: params.cursor ?? '',
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
          compass: compass || { x: 0, y: 0, ninth: 'center' },
          participantCount: res.participantCount,
          cursor: res.cursor,
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}
