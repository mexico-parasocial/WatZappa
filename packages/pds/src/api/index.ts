import { Server } from '@atproto/xrpc-server'
import { AppContext } from '../context.js'
import { ComParaNS, Server as ParaLexiconServer } from '../lexicon/index.js'
import { schemas as paraSchemas } from '../lexicon/lexicons.js'
import appBsky from './app/bsky/index.js'
import comAtproto from './com/atproto/index.js'
import comPara from './com/para/index.js'

export default function (server: Server, ctx: AppContext) {
  server.addLexicons(paraSchemas)
  comAtproto(server, ctx)
  const paraServer = { xrpc: server } as ParaLexiconServer
  ;(paraServer as any).com = { para: new ComParaNS(paraServer) }
  comPara(paraServer, ctx)
  appBsky(server, ctx)
  return server
}
