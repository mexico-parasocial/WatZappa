// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { forwardDataplaneErrors, parseDataplaneJson } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.xrpc.method('com.para.community.civicTree.createRelationship', {
    auth: ctx.authVerifier.standard,
    handler: async ({ input: { body: input }, auth }) => {
      // xrpc-server hands procedures `{ encoding, body }`; reading the fields
      // off `input` itself left every one undefined (CommunityNotFound).
      // Relationships are attributed to the authenticated account.
      const authorDid = auth.credentials.iss

      const res = await forwardDataplaneErrors(() =>
        ctx.dataplane.createParaCommunityCivicTreeRelationship({
          communityUri: input.communityUri,
          authorDid,
          sourceCardId: input.sourceCardId,
          targetCardId: input.targetCardId,
          relationshipType: input.relationshipType,
        }),
      )

      return {
        encoding: 'application/json' as const,
        body: {
          relationship: parseDataplaneJson(res.relationshipJson, null),
        },
      }
    },
  })
}
