// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.raq.getProposals({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaProposals({
        community: params.community || '',
        limit: params.limit,
        cursor: params.cursor || '',
        viewerDid: viewer ?? '',
      })

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: {
          cursor: res.cursor || undefined,
          proposals: res.proposals.map((p) => ({
            uri: p.uri,
            cid: p.cid,
            creator: p.creator,
            text: p.text,
            targetAxis: p.targetAxis || undefined,
            targetCommunity: p.targetCommunity || undefined,
            upvotes: p.upvotes,
            downvotes: p.downvotes,
            answerCount: p.answerCount,
            answerAverage: p.answerAverage,
            viewerUpvote: p.viewerUpvote,
            viewerDownvote: p.viewerDownvote,
            viewerAnswer: p.viewerAnswer,
            createdAt: p.createdAt,
            indexedAt: p.indexedAt,
          })),
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}
