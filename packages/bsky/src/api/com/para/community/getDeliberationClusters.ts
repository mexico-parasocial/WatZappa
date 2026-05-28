// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.getDeliberationClusters({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaDeliberationClusters({
        proposal: params.proposal ?? '',
      })

      const clusters = parseDataplaneJson<ClusterRow[]>(res.clustersJson, [])
      const bridging = parseDataplaneJson<StatementRow[]>(res.bridgingJson, [])

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          clusters: clusters.map((c) => ({
            stance: c.stance,
            statementCount: c.statementCount,
            totalAgree: c.totalAgree,
            totalDisagree: c.totalDisagree,
            totalPass: c.totalPass,
          })),
          bridging: bridging.map((s) => ({
            uri: s.uri,
            body: s.body,
            agreeCount: s.agreeCount,
            disagreeCount: s.disagreeCount,
            passCount: s.passCount,
          })),
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

interface ClusterRow {
  stance: string
  statementCount: number
  totalAgree: number
  totalDisagree: number
  totalPass: number
}

interface StatementRow {
  uri: string
  body: string
  agreeCount: number
  disagreeCount: number
  passCount: number
}

function parseDataplaneJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
