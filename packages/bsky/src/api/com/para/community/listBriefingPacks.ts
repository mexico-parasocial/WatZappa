import type { AtUriString, DatetimeString, DidString } from '@atproto/lex'
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { parseString } from '../../../../hydration/util.js'
import { com } from '../../../../lexicons/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.community.listBriefingPacks, {
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

      const packs: com.para.community.defs.BriefingPackView[] =
        res.briefingPacks.map((p) => ({
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
