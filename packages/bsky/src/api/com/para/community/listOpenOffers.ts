import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { resHeaders } from '../../../util.js'
import { forwardDataplaneErrors, parseDataplaneJson } from './civicTree/util.js'

type OfferView = com.para.community.listOpenOffers.OfferView

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.listOpenOffers, {
    auth: ctx.authVerifier.standard,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane.getParaCommunityOpenOffers({
          community: params.community,
          viewerDid: viewer ?? '',
          limit: params.limit ?? 50,
          cursor: params.cursor ?? '',
        }),
      )
      return {
        encoding: 'application/json' as const,
        body: {
          offers: parseDataplaneJson<OfferView[]>(res.itemsJson, []),
          cursor: res.cursor || undefined,
        },
        headers: resHeaders({
          repoRev: await ctx.hydrator.actor.getRepoRevSafe(viewer),
          labelers: ctx.reqLabelers(req),
        }),
      }
    },
  })
}
