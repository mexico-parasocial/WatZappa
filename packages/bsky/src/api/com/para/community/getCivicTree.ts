// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.getCivicTree({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          nodes: [],
          edges: [],
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
