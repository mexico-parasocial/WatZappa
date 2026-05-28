// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import getProfileStats from './getProfileStats.js'

export default function (server: Server, ctx: AppContext) {
  getProfileStats(server, ctx)
}
