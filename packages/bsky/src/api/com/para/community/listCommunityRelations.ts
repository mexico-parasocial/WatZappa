// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/community/listCommunityRelations.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listCommunityRelations({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const result = await listCommunityRelations({ ctx, params })
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: result,
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

export const listCommunityRelations = async ({
  ctx,
  params,
}: {
  ctx: AppContext
  params: QueryParams
}) => {
  const res = await ctx.dataplane.getParaCommunityRelations({
    communityUri: params.communityUri ?? '',
    parentCommunityUri: params.parentCommunityUri ?? '',
    childCommunityUri: params.childCommunityUri ?? '',
    relation: params.relation ?? 'parentChild',
    limit: normalizeLimit(params.limit),
    cursor: params.cursor ?? '',
  })

  return {
    relations: res.relations.map((relation) => ({
      uri: relation.uri,
      cid: relation.cid,
      parentCommunityUri: relation.parentCommunityUri,
      childCommunityUri: relation.childCommunityUri,
      relation: relation.relation,
      createdAt: relation.createdAt,
      createdBy: relation.createdBy,
    })),
    cursor: parseString(res.cursor),
  }
}

const normalizeLimit = (limit: number | undefined) => {
  if (!limit || Number.isNaN(limit)) return 50
  return Math.max(1, Math.min(limit, 100))
}
