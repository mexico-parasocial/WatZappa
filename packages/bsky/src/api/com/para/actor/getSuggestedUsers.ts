// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { DataPlaneClient } from '../../../../data-plane/index.js'
import { Hydrator } from '../../../../hydration/hydrator.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/actor/getSuggestedUsers.js'
import { Views } from '../../../../views/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.actor.getSuggestedUsers({
    auth: ctx.authVerifier.standardOptional,
    handler: async ({ params, auth, req }) => {
      const viewer = auth?.credentials.iss ?? null
      const labelers = ctx.reqLabelers(req)
      const hydrateCtx = await ctx.hydrator.createContext({
        labelers,
        viewer,
        includeTakedowns: false,
      })

      const result = await getParaSuggestedUsers({
        ctx,
        params: {...params, hydrateCtx},
      })

      const repoRev = viewer
        ? await ctx.hydrator.actor.getRepoRevSafe(viewer)
        : undefined

      return {
        encoding: 'application/json' as const,
        body: result,
        headers: resHeaders({
          repoRev,
          labelers: hydrateCtx.labelers,
        }),
      }
    },
  })
}

const getParaSuggestedUsers = async (inputs: {
  ctx: Context
  params: Params
}) => {
  const {ctx, params} = inputs
  const viewerDid = params.hydrateCtx.viewer ?? undefined

  const res = await ctx.dataplane.getParaSuggestedUsers({
    viewerDid: viewerDid ?? '',
    category: params.category ?? '',
    interests: params.interests ?? [],
    limit: params.limit ?? 25,
    cursor: params.cursor ?? '',
  })

  const dids = (res.candidates ?? []).map(c => c.did).filter(Boolean)
  if (dids.length === 0) {
    return {actors: [], recId: undefined, cursor: res.cursor}
  }

  // Hydrate full profiles (and the follow/blocks state for the viewer)
  const profileState = await ctx.hydrator.hydrateProfiles(
    dids,
    params.hydrateCtx,
  )
  const profileViewerState = viewerDid
    ? await ctx.hydrator.hydrateProfileViewers(dids, params.hydrateCtx)
    : undefined
  const followState = viewerDid
    ? await ctx.hydrator.hydrateFollows(
        new Map([[viewerDid, dids]]),
        params.hydrateCtx,
      )
    : undefined
  const blocksState = viewerDid
    ? await ctx.hydrator.hydrateBidirectionalBlocks(
        new Map([[viewerDid, dids]]),
        params.hydrateCtx,
      )
    : undefined

  const presented = dids
    .map(did => {
      const viewerState = profileViewerState?.profileViewers?.get(did)
      if (
        viewerDid &&
        (viewerState?.following ||
          (blocksState?.get(viewerDid)?.get(did) ?? false))
      ) {
        return null
      }
      return ctx.views.profile(did, {
        ...profileState,
        profileViewers: profileViewerState?.profileViewers,
        follows: followState,
        bidirectionalBlocks: blocksState
          ? new Map([
              [
                viewerDid ?? '',
                blocksState.get(viewerDid ?? '') ?? new Map(),
              ],
            ])
          : undefined,
      })
    })
    .filter(Boolean)

  return {
    actors: presented,
    recId: undefined,
    cursor: res.cursor,
  }
}

type Context = {
  dataplane: DataPlaneClient
  hydrator: Hydrator
  views: Views
}

type Params = QueryParams & {
  hydrateCtx: import('../../../../hydration/hydrator.js').HydrateCtx
}
