import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../context.js'
import account from './account/index.js'
import alpha from './alpha/index.js'
import civic from './civic/index.js'
import community from './community/index.js'
import feed from './feed/index.js'

/*
 * PARA's PDS methods. Read-only com.para queries without read-after-write
 * (e.g. actor.getProfileStats, social.getPostMeta, community.getGovernance)
 * need no handler: the catch-all proxy forwards them to the AppView.
 */
export default function (server: Server, ctx: AppContext) {
  account(server, ctx)
  alpha(server, ctx)
  civic(server, ctx)
  community(server, ctx)
  feed(server, ctx)
}
