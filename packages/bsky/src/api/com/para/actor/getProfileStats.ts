import { toDatetimeString } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import type { DataPlaneClient } from '../../../../data-plane/index.js'
import type { HydrateCtx, Hydrator } from '../../../../hydration/hydrator.js'
import { parseJsonBytes, parseString } from '../../../../hydration/util.js'
import type { Server } from '../../../../lexicon/index.js'
import { app, com } from '../../../../lexicons/index.js'
import type { Views } from '../../../../views/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.xrpc.add(com.para.actor.getProfileStats, {
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer, includeTakedowns } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const hydrateCtx = await ctx.hydrator.createContext({
        labelers,
        viewer,
        includeTakedowns,
      })

      const result = await getProfileStats({
        ctx,
        params: { ...params, hydrateCtx },
      })
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: result,
        headers: {
          ...resHeaders({ repoRev, labelers: hydrateCtx.labelers }),
          'cache-control': 'private, no-store',
        },
      }
    },
  })
}

const getProfileStats = async (inputs: { ctx: Context; params: Params }) => {
  const { ctx, params } = inputs
  const [did] = await ctx.hydrator.actor.getDids([params.actor])
  if (!did) {
    throw new InvalidRequestError('Profile not found', 'NotFound')
  }

  const actors = await ctx.hydrator.actor.getActors([did], {
    includeTakedowns: params.hydrateCtx.includeTakedowns,
    skipCacheForDids: params.hydrateCtx.skipCacheForViewer,
  })
  const actor = actors.get(did)
  if (!actor) {
    throw new InvalidRequestError('Profile not found', 'NotFound')
  }

  const profileViewerState = await ctx.hydrator.hydrateProfileViewers(
    [actor.did],
    params.hydrateCtx,
  )
  const relationship = profileViewerState.profileViewers?.get(actor.did)
  if (
    relationship &&
    (relationship.blocking ||
      ctx.views.blockingByList(relationship, profileViewerState))
  ) {
    throw new InvalidRequestError(
      `Requester has blocked actor: ${actor.did}`,
      'BlockedActor',
    )
  }
  if (
    relationship &&
    (relationship.blockedBy ||
      ctx.views.blockedByList(relationship, profileViewerState))
  ) {
    throw new InvalidRequestError(
      `Requester is blocked by actor: ${actor.did}`,
      'BlockedByActor',
    )
  }

  const res = await ctx.dataplane.getParaProfileStats({ actorDid: did })
  const computedAt =
    parseString(res.stats?.computedAt) ?? new Date().toISOString()

  const profiles = await ctx.dataplane.getProfileRecords({
    uris: [`at://${did}/${app.bsky.actor.profile.$type}/self`],
  })
  const profile = profiles.records[0]
    ? parseJsonBytes(app.bsky.actor.profile.main, profiles.records[0].record)
    : undefined
  const influenceVisible = profile?.revealInfluence === true
  const canSeeInfluence = influenceVisible || params.hydrateCtx.viewer === did

  const result: com.para.actor.getProfileStats.$OutputBody = {
    actor: did,
    influenceVisible,
    stats: {
      influence: canSeeInfluence ? (res.stats?.influence ?? 0) : 0,
      votesReceivedAllTime: canSeeInfluence
        ? (res.stats?.votesReceivedAllTime ?? 0)
        : 0,
      votesCastAllTime: res.stats?.votesCastAllTime ?? 0,
      contributions: {
        policies: res.stats?.contributions?.policies ?? 0,
        matters: res.stats?.contributions?.matters ?? 0,
        comments: res.stats?.contributions?.comments ?? 0,
      },
      activeIn: res.stats?.activeIn ?? [],
      computedAt: toDatetimeString(computedAt),
    },
    status: res.status
      ? {
          status: res.status.status,
          party: parseString(res.status.party),
          community: parseString(res.status.community),
          createdAt: toDatetimeString(res.status.createdAt),
        }
      : undefined,
  }

  return result
}

type Context = {
  dataplane: DataPlaneClient
  hydrator: Hydrator
  views: Views
}

type Params = com.para.actor.getProfileStats.$Params & {
  hydrateCtx: HydrateCtx
}
