// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { forwardDataplaneErrors, parseDataplaneJson } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.xrpc.method('com.para.community.civicTree.voteContribution', {
    auth: ctx.authVerifier.standard,
    handler: async ({ input, auth }) => {
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
        encoding: 'application/json' as const,
        body: {
          contribution: parseDataplaneJson(res.contributionJson, null),
        },
      }
    },
  })
}
