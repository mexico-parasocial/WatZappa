import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import act from './act.js'
import { createBriefingPack, updateBriefingPack } from './briefingPack.js'
import create from './create.js'
import shareContent from './shareContent.js'

export default function (server: Server, ctx: AppContext) {
  create(server, ctx)
  act(server, ctx)
  createBriefingPack(server, ctx)
  updateBriefingPack(server, ctx)
  shareContent(server, ctx)
}
