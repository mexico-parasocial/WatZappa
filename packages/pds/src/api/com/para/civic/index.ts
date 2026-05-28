// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import castVote from './castVote.js'

export default function (server: Server, ctx: AppContext) {
  castVote(server, ctx)
}
