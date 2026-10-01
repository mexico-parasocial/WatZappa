import type { Server } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.getAuthorization, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const result = await ctx.dataplane.getParaCommunityAuthorization({
        community: params.community,
        action: params.action,
        subject: params.subject ?? '',
        viewerDid: viewer ?? '',
      })
      const authorization = result.authorization
      return {
        encoding: 'application/json',
        body: {
          roles: result.roles as ('member' | 'moderator' | 'owner')[],
          capabilities: result.capabilities,
          authorization: {
            action: authorization?.action || params.action,
            status: (authorization?.status || 'denied') as
              | 'allowed'
              | 'requires_approval'
              | 'denied',
            policy: authorization?.policy || 'role_required',
            reason: authorization?.reason || undefined,
            evidence: authorization?.evidence || undefined,
          },
        },
      }
    },
  })
}
