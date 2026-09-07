// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { forwardDataplaneErrors, parseDataplaneJson } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.xrpc.method('com.para.community.civicTree.submitContribution', {
    auth: ctx.authVerifier.standard,
    handler: async ({ input, auth }) => {
      /*
       * The author is the authenticated account. The lexicon carries authorDid
       * so clients can state intent, but trusting the payload would let one
       * account file contributions as another.
       */
      const authorDid = auth.credentials.iss

      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane.submitParaCommunityCivicTreeContribution({
          communityUri: input.communityUri,
          authorDid,
          title: input.title,
          content: input.content ?? '',
          sourceUri: input.sourceUri ?? '',
          sourceUrl: input.sourceUrl ?? '',
          sourceType: input.sourceType,
          metadata: input.metadata ?? '',
        }),
      )

      return {
        encoding: 'application/json' as const,
        body: {
          contribution: parseDataplaneJson(res.contributionJson, null),
        },
      }
    },
  })
}
