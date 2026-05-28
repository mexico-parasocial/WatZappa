// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { DataPlaneClient } from '../../../../data-plane/index.js'
import { parseCid, parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/civic/listCabildeoPositions.js'
import { clearlyBadCursor, resHeaders } from '../../../util.js'
import { parseDataplaneJson } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.civic.listCabildeoPositions({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const result = await listCabildeoPositions({
        ctx,
        params,
      })
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: result,
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

const listCabildeoPositions = async (inputs: {
  ctx: Context
  params: QueryParams
}) => {
  const { ctx, params } = inputs
  if (clearlyBadCursor(params.cursor)) {
    return { positions: [] }
  }

  const res = await ctx.dataplane.getParaCabildeoPositions({
    cabildeoUri: params.cabildeo,
    stance: params.stance ?? '',
    limit: params.limit,
    cursor: params.cursor ?? '',
  })

  return {
    positions: parseDataplaneJson<
      Array<{
        uri: string
        cid: string
        creator: string
        indexedAt: string
        cabildeo: string
        stance: string
        optionIndex?: number
        text: string
        compassQuadrant?: string
        createdAt: string
      }>
    >(res.positionsJson, []).map((position) => ({
      uri: position.uri,
      cid: parseCidOrThrow(position.cid),
      creator: position.creator,
      indexedAt: position.indexedAt,
      cabildeo: position.cabildeo,
      stance: position.stance,
      optionIndex: position.optionIndex,
      text: position.text,
      compassQuadrant: parseString(position.compassQuadrant),
      createdAt: position.createdAt,
    })),
    cursor: parseString(res.cursor),
  }
}

const parseCidOrThrow = (cidStr: string) => {
  const cid = parseCid(cidStr)
  if (!cid) {
    throw new Error(`Invalid CID in cabildeo position view: ${cidStr}`)
  }
  return cid
}

type Context = {
  dataplane: DataPlaneClient
  hydrator: AppContext['hydrator']
}
