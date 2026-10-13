import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { SimpleSpaceManager } from '../../../../simplespace/manager.js'
import createSpace from './createSpace.js'
import deleteSpace from './deleteSpace.js'
import getSpace from './getSpace.js'
import listMembers from './listMembers.js'
import updateSpace from './updateSpace.js'

// The simplespace host for spaces an account owns, with the owner as their only
// member (see simplespace/manager.ts). putMember, removeMember and
// checkUserAccess are not served yet. Only registered with PDS_SPACES_ENABLED.
export default function (server: Server, ctx: AppContext) {
  const manager = new SimpleSpaceManager(ctx.actorStore)
  createSpace(server, ctx, manager)
  deleteSpace(server, ctx, manager)
  getSpace(server, ctx, manager)
  listMembers(server, ctx)
  updateSpace(server, ctx, manager)
}
