import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import acceptDraftInvite from './acceptDraftInvite.js'
import { createBriefingPack, updateBriefingPack } from './briefingPack.js'
import createBoard from './createBoard.js'
import getBoard from './getBoard.js'
import listBoards from './listBoards.js'
import { join, leave } from './membership.js'
import shareContent from './shareContent.js'
import {
  removeSharedContent,
  restoreSharedContent,
} from './sharedContentAction.js'

export default function (server: Server, ctx: AppContext) {
  createBoard(server, ctx)
  createBriefingPack(server, ctx)
  updateBriefingPack(server, ctx)
  getBoard(server, ctx)
  listBoards(server, ctx)
  acceptDraftInvite(server, ctx)
  join(server, ctx)
  leave(server, ctx)
  shareContent(server, ctx)
  removeSharedContent(server, ctx)
  restoreSharedContent(server, ctx)
}
