import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { getAuthorFeed, getTimeline } from './getFeeds.js'
import getPostThread from './getPostThread.js'
import getPosts from './getPosts.js'

export default function (server: Server, ctx: AppContext) {
  getAuthorFeed(server, ctx)
  getPostThread(server, ctx)
  getPosts(server, ctx)
  getTimeline(server, ctx)
}
