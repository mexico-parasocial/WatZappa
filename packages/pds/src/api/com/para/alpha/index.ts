// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import createInvite from './createInvite.js'
import getAccess from './getAccess.js'
import getRolloutStatus from './getRolloutStatus.js'
import requestAccess from './requestAccess.js'

export default function (server: Server, ctx: AppContext) {
  createInvite(server, ctx)
  getAccess(server, ctx)
  requestAccess(server, ctx)
  getRolloutStatus(server, ctx)
}
