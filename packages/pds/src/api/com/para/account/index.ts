// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import getAuthFactor from './getAuthFactor.js'
import setAuthFactor from './setAuthFactor.js'

export default function (server: Server, ctx: AppContext) {
  getAuthFactor(server, ctx)
  setAuthFactor(server, ctx)
}
