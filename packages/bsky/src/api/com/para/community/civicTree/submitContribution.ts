import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../../context.js'
import { com } from '../../../../../lexicons/index.js'
import { forwardDataplaneErrors, parseDataplaneJson } from './util.js'

type ContributionView = com.para.community.civicTree.defs.ContributionView

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.civicTree.submitContribution, {
    auth: ctx.authVerifier.standard,
    handler: async ({ input: { body: input }, auth }) => {
      // xrpc-server hands procedures `{ encoding, body }`; reading the fields
      // off `input` itself left every one undefined (CommunityNotFound).
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
        encoding: 'application/json',
        body: {
          contribution: parseDataplaneJson<ContributionView | null>(
            res.contributionJson,
            null,
          ) as ContributionView,
        },
      }
    },
  })
}
