// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import getAuthorFeed from './getAuthorFeed.js'
import getPostThread from './getPostThread.js'
import getPosts from './getPosts.js'
import getTimeline from './getTimeline.js'

export default function (server: Server, ctx: AppContext) {
  getAuthorFeed(server, ctx)
  getPostThread(server, ctx)
  getPosts(server, ctx)
  getTimeline(server, ctx)
}
