// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listDeliberationVotes({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaDeliberationVotes({
        statement: params.statement ?? '',
        direction: params.direction ?? '',
        limit: params.limit,
        cursor: params.cursor ?? '',
      })

      const votes = parseDataplaneJson<VoteRow[]>(res.itemsJson, [])

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          votes: votes.map((v) => ({
            uri: v.uri,
            cid: v.cid,
            statement: v.statement,
            voter: v.voter,
            direction: v.vote,
            createdAt: v.createdAt,
          })),
          cursor: res.cursor || undefined,
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

interface VoteRow {
  uri: string
  cid: string
  statement: string
  voter: string
  vote: string
  createdAt: string
}

function parseDataplaneJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
