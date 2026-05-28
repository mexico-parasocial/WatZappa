// @ts-nocheck
import { AppContext } from '../../../../context.js'

type Labelers = ReturnType<AppContext['reqLabelers']>

export const getVisibleParticipantDids = async (opts: {
  ctx: AppContext
  dids: string[]
  viewer?: string
  labelers: Labelers
}) => {
  const { ctx, dids, viewer, labelers } = opts
  if (!dids.length) return new Set<string>()

  const hydrateCtx = await ctx.hydrator.createContext({
    viewer: viewer ?? null,
    labelers,
  })
  const hydration = await ctx.hydrator.hydrateProfilesBasic(dids, hydrateCtx)

  return dids.reduce((acc, did) => {
    if (!ctx.views.profileBasic(did, hydration)) {
      return acc
    }
    if (ctx.views.viewerBlockExists(did, hydration)) {
      return acc
    }
    if (ctx.views.actorIsNoHosted(did, hydration)) {
      return acc
    }
    acc.add(did)
    return acc
  }, new Set<string>())
}

export const parseDataplaneJson = <T>(
  value: string | undefined,
  fallback: T,
): T => {
  if (!value) return fallback
  return JSON.parse(value) as T
}
