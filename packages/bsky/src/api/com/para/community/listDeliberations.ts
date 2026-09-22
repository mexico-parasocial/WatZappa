// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

type StatementRow = {
  uri: string
  cid: string
  creator: string
  proposal: string
  body: string
  stance: string | null
  agreeCount?: number
  disagreeCount?: number
  passCount?: number
  viewerDirection?: string
  createdAt: string
}

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listDeliberations({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaDeliberations({
        proposal: params.proposal ?? '',
        viewer: viewer ?? '',
        limit: params.limit,
        cursor: params.cursor ?? '',
      })

      const rows = parseRows(res.itemsJson)
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: {
          cursor: res.cursor || undefined,
          statements: rows.map((row) => ({
            uri: row.uri,
            cid: row.cid,
            creator: row.creator,
            proposal: row.proposal,
            body: row.body,
            stance: row.stance ?? '',
            agreeCount: row.agreeCount ?? 0,
            disagreeCount: row.disagreeCount ?? 0,
            passCount: row.passCount ?? 0,
            // Only ever the requesting viewer's own position: who else took
            // which side is not part of this view.
            viewerDirection: row.viewerDirection,
            createdAt: row.createdAt,
          })),
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

function parseRows(json: string): StatementRow[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
