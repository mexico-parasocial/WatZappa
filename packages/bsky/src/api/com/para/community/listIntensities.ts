// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listIntensities({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaIntensities({
        proposal: params.proposal ?? '',
        limit: params.limit,
        cursor: params.cursor ?? '',
      })

      const intensities = parseDataplaneJson<IntensityRow[]>(res.itemsJson, [])

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          intensities: intensities.map((i) => ({
            uri: i.uri,
            cid: i.cid,
            proposal: i.proposal,
            voter: i.voter,
            signal: i.signal,
            units: i.units,
            creditsSpent: i.creditsSpent,
            delegatedFrom: i.delegatedFrom ?? undefined,
            delegationDepth: i.delegationDepth,
            effectiveWeight: i.effectiveWeight ?? undefined,
            createdAt: i.createdAt,
          })),
          cursor: res.cursor || undefined,
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

interface IntensityRow {
  uri: string
  cid: string
  proposal: string
  voter: string
  signal: number
  units: number
  creditsSpent: number
  delegatedFrom: string[] | null
  delegationDepth: number
  effectiveWeight: string | null
  createdAt: string
}

function parseDataplaneJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
