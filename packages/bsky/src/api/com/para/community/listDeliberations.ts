// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listDeliberations({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaDeliberations({
        proposal: params.proposal ?? '',
        stance: params.stance ?? '',
        limit: params.limit,
        cursor: params.cursor ?? '',
      })

      const statements = parseDataplaneJson<StatementRow[]>(res.itemsJson, [])

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          statements: statements.map((s) => ({
            uri: s.uri,
            cid: s.cid,
            creator: s.creator,
            proposal: s.proposal,
            body: s.body,
            stance: s.stance,
            agreeCount: s.agreeCount,
            disagreeCount: s.disagreeCount,
            passCount: s.passCount,
            createdAt: s.createdAt,
          })),
          cursor: res.cursor || undefined,
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

interface StatementRow {
  uri: string
  cid: string
  creator: string
  proposal: string
  body: string
  stance: string
  agreeCount: number
  disagreeCount: number
  passCount: number
  createdAt: string
}

function parseDataplaneJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
