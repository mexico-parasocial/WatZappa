// @ts-nocheck
import { AppContext } from '../../../context.js'
import { Server } from '../../../lexicon/index.js'
import actor from './actor/index.js'
import alpha from './alpha/index.js'
import civic from './civic/index.js'
import community from './community/index.js'
import feed from './feed/index.js'
import social from './social/index.js'

export default function (server: Server, ctx: AppContext) {
  actor(server, ctx)
  alpha(server, ctx)
  civic(server, ctx)
  community(server, ctx)
  feed(server, ctx)
  social(server, ctx)
}
