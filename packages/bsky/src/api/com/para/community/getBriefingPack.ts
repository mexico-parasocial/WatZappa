import type { AtUriString, DatetimeString, DidString } from '@atproto/lex'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { parseString } from '../../../../hydration/util.js'
import { com } from '../../../../lexicons/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.getBriefingPack, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      if (!params.uri) {
        throw new InvalidRequestError('uri is required')
      }

      const res = await ctx.dataplane.getParaCommunityBriefingPack({
        uri: params.uri,
        viewerDid: viewer ?? '',
      })

      if (!res.briefingPack) {
        throw new InvalidRequestError('Briefing pack not found', 'NotFound')
      }

      const p = res.briefingPack
      const pack: com.para.community.defs.BriefingPackView = {
        $type: 'com.para.community.defs#briefingPackView' as const,
        uri: p.uri as AtUriString,
        cid: p.cid,
        packType: 'party_lobbying' as const,
        communityUri: p.communityUri as AtUriString,
        party: '',
        title: p.title,
        summary: parseString(p.description),
        status: (p.status as 'draft' | 'published' | 'archived') ?? 'draft',
        createdBy: p.createdBy as DidString,
        createdAt: p.createdAt as DatetimeString,
        updatedAt: p.updatedAt as DatetimeString,
      }

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: { pack },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}
