// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listVotes({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)

      const res = await ctx.dataplane.getParaVotes({
        proposal: params.proposal ?? '',
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
            creator: v.creator,
            proposal: v.proposal,
            community: v.community,
            signal: v.signal,
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
  creator: string
  proposal: string
  community: string
  signal: number
  createdAt: string
}

function parseDataplaneJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
