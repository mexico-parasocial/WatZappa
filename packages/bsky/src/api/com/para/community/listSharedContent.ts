// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/community/listSharedContent.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listSharedContent({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const res = await listSharedContent({ ctx, params, viewer: viewer ?? '' })
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: res,
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

const listSharedContent = async ({
  ctx,
  params,
  viewer,
}: {
  ctx: AppContext
  params: QueryParams
  viewer: string
}) => {
  const res = await ctx.dataplane.getParaCommunitySharedContent({
    communityUri: params.communityUri,
    contentType: params.contentType ?? '',
    includeRemoved: Boolean(params.includeRemoved),
    includeChildren: Boolean(params.includeChildren),
    limit: normalizeLimit(params.limit),
    cursor: params.cursor ?? '',
    viewerDid: viewer,
  })

  return {
    items: res.items.map((item) => ({
      uri: item.uri,
      cid: item.cid,
      subject: item.subject
        ? { uri: item.subject.uri, cid: item.subject.cid }
        : { uri: '', cid: '' },
      communityUri: item.communityUri,
      sourceCommunityUri: parseString(item.sourceCommunityUri),
      contentType: item.contentType,
      sharedBy: item.sharedBy,
      sharedByHandle: parseString(item.sharedByHandle),
      note: parseString(item.note),
      visibility: parseString(item.visibility),
      sourceApp: parseString(item.sourceApp),
      pinned: item.pinned,
      sortRank: item.sortRank || undefined,
      createdAt: item.createdAt,
      removed: item.removed,
      removedAt: parseString(item.removedAt),
      removedBy: parseString(item.removedBy),
      latestAction: item.latestAction
        ? {
            uri: item.latestAction.uri,
            cid: item.latestAction.cid,
            sharedContent: item.latestAction.sharedContent
              ? {
                  uri: item.latestAction.sharedContent.uri,
                  cid: item.latestAction.sharedContent.cid,
                }
              : { uri: '', cid: '' },
            communityUri: item.latestAction.communityUri,
            action: item.latestAction.action,
            note: parseString(item.latestAction.note),
            createdAt: item.latestAction.createdAt,
            createdBy: item.latestAction.createdBy,
          }
        : undefined,
      hydrationState: parseString(item.hydrationState) ?? 'unresolved',
    })),
    cursor: parseString(res.cursor),
  }
}

const normalizeLimit = (limit: number | undefined) => {
  if (!limit || Number.isNaN(limit)) return 50
  return Math.max(1, Math.min(limit, 100))
}
