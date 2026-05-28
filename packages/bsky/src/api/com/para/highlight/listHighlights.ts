// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { DataPlaneClient } from '../../../../data-plane/index.js'
import { parseCid, parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/highlight/listHighlights.js'
import { clearlyBadCursor, resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.highlight.listHighlights({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const result = await listHighlights({ ctx, params })
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: result,
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

const listHighlights = async (inputs: {
  ctx: Context
  params: QueryParams
}) => {
  const { ctx, params } = inputs
  if (clearlyBadCursor(params.cursor)) {
    return { highlights: [] }
  }

  const res = await ctx.dataplane.getParaHighlights({
    community: params.community ?? '',
    state: params.state ?? '',
    subjectUri: params.subject ?? '',
    creator: params.creator ?? '',
    limit: params.limit,
    cursor: params.cursor ?? '',
  })

  return {
    highlights: res.items.map(mapHighlightView),
    cursor: parseString(res.cursor),
  }
}

const mapHighlightView = (view: {
  uri: string
  cid: string
  creator: string
  indexedAt: string
  subjectUri: string
  subjectCid: string
  text: string
  start: number
  end: number
  color: string
  tag: string
  community: string
  state: string
  party: string
  visibility: string
  createdAt: string
}) => ({
  uri: view.uri,
  cid: parseCidOrThrow(view.cid),
  creator: view.creator,
  indexedAt: view.indexedAt,
  subjectUri: view.subjectUri,
  subjectCid: parseString(view.subjectCid),
  text: view.text,
  start: view.start,
  end: view.end,
  color: view.color,
  tag: parseString(view.tag),
  community: parseString(view.community),
  state: parseString(view.state),
  party: parseString(view.party),
  visibility: view.visibility,
  createdAt: view.createdAt,
})

const parseCidOrThrow = (cidStr: string) => {
  const cid = parseCid(cidStr)
  if (!cid) {
    throw new Error(`Invalid CID in highlight view: ${cidStr}`)
  }
  return cid
}

type Context = {
  dataplane: DataPlaneClient
  hydrator: AppContext['hydrator']
}
