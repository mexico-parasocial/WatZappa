import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'
import type { BriefingPackView } from '../../../../lexicon/types/com/para/community/defs.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listBriefingPacks({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaCommunityBriefingPacks({
        communityUri: params.community ?? '',
        viewerDid: viewer ?? '',
        limit: normalizeLimit(params.limit),
        cursor: params.cursor ?? '',
        query: '',
        status: params.status ?? '',
      })

      const packs: BriefingPackView[] = res.briefingPacks.map((p) => ({
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
      }))

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          packs,
          cursor: parseString(res.cursor),
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

const normalizeLimit = (limit: number | undefined) => {
  if (!limit || Number.isNaN(limit)) return 50
  return Math.max(1, Math.min(limit, 100))
}
