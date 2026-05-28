// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import getPostMeta from './getPostMeta.js'

export default function (server: Server, ctx: AppContext) {
  getPostMeta(server, ctx)
}
