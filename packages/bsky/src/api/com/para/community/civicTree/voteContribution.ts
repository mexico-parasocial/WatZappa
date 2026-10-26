import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../../context.js'
import { com } from '../../../../../lexicons/index.js'
import { forwardDataplaneErrors, parseDataplaneJson } from './util.js'

type ContributionView = com.para.community.civicTree.defs.ContributionView

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.civicTree.voteContribution, {
    auth: ctx.authVerifier.standard,
    handler: async ({ input: { body: input }, auth }) => {
      // xrpc-server hands procedures `{ encoding, body }`; reading the fields
      // off `input` itself left every one undefined (CommunityNotFound).
      // Same anti-spoof rule as submitContribution: votes are cast by the
      // authenticated account, never by a DID from the payload.
      const voterDid = auth.credentials.iss

      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane.voteParaCommunityCivicTreeContribution({
          contributionId: input.contribution,
          voterDid,
          vote: input.vote,
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
