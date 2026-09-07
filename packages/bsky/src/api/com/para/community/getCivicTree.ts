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

      const res = await ctx.dataplane.getParaCommunityCivicTreeGraph({
        communityUri: params.community,
        viewerDid: viewer ?? '',
      })

      const nodes = parseDataplaneJson<CardRow[]>(res.nodesJson, [])
      const edges = parseDataplaneJson<GraphEdgeRow[]>(res.edgesJson, [])

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: {
          nodes,
          edges: edges.map((edge) => ({
            id: edge.id,
            community_uri: params.community,
            source_card_id: edge.source,
            target_card_id: edge.target,
            relationship_type: edge.relationship_type,
            author_did: edge.author_did,
            created_at: edge.created_at,
          })),
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

interface CardRow {
  id: string
  title: string
  card_type: string
  author_did: string
  community_uri: string
  influence: number
  vote_count: number
  stance?: string
  compass_quadrant?: string
  content: string | null
  source_url: string | null
  metadata: string | null
}

interface GraphEdgeRow {
  id: string
  source: string
  target: string
  relationship_type: string
  author_did?: string
  created_at?: string
}

function parseDataplaneJson<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}
