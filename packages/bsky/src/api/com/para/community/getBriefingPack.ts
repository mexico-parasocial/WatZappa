import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'
import type { BriefingPackView } from '../../../../lexicon/types/com/para/community/defs.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.getBriefingPack({
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
      const pack: BriefingPackView = {
        $type: 'com.para.community.defs#briefingPackView' as const,
        uri: p.uri,
        cid: p.cid,
        packType: 'party_lobbying' as const,
        communityUri: p.communityUri,
        party: '',
        title: p.title,
        summary: parseString(p.description),
        status: (p.status as 'draft' | 'published' | 'archived') ?? 'draft',
        createdBy: p.createdBy,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
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
