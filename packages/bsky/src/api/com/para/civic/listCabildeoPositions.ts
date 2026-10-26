import type { AtUriString, DatetimeString, DidString } from '@atproto/lex'
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import type { DataPlaneClient } from '../../../../data-plane/index.js'
import { parseCid, parseString } from '../../../../hydration/util.js'
import { com } from '../../../../lexicons/index.js'
import { clearlyBadCursor, resHeaders } from '../../../util.js'
import { parseDataplaneJson } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.civic.listCabildeoPositions, {
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
  params: com.para.civic.listCabildeoPositions.$Params
}): Promise<com.para.civic.listCabildeoPositions.$OutputBody> => {
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
        uri: AtUriString
        cid: string
        creator: DidString
        indexedAt: DatetimeString
        cabildeo: AtUriString
        stance: string
        optionIndex?: number
        text: string
        compassQuadrant?: string
        createdAt: DatetimeString
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
