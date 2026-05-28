// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import acceptDraftInvite from './acceptDraftInvite.js'
import createBoard from './createBoard.js'
import getBoard from './getBoard.js'
import getGovernance from './getGovernance.js'
import join from './join.js'
import leave from './leave.js'
import listBoards from './listBoards.js'
import shareContent from './shareContent.js'
import {
  removeSharedContent,
  restoreSharedContent,
} from './sharedContentAction.js'

export default function (server: Server, ctx: AppContext) {
  createBoard(server, ctx)
  getBoard(server, ctx)
  getGovernance(server, ctx)
  listBoards(server, ctx)
  acceptDraftInvite(server, ctx)
  join(server, ctx)
  leave(server, ctx)
  shareContent(server, ctx)
  removeSharedContent(server, ctx)
  restoreSharedContent(server, ctx)
}
