// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { ids } from '../../../../lexicon/lexicons.js'
import { OutputSchema } from '../../../../lexicon/types/com/para/feed/getTimeline.js'
import { com } from '../../../../lexicons/index.js'
import { computeProxyTo } from '../../../../pipethrough.js'
import {
  LocalRecords,
  LocalViewer,
  pipethroughReadAfterWrite,
} from '../../../../read-after-write/index.js'
import { insertLocalPostsInFeed } from './util.js'

export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.com.para.feed.getTimeline({
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = ids.ComParaFeedGetTimeline
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async (reqCtx) => {
      return pipethroughReadAfterWrite(
        ctx,
        reqCtx,
        com.para.feed.getTimeline.main,
        getTimelineMunge,
      )
    },
  })
}

const getTimelineMunge = async (
  _localViewer: LocalViewer,
  original: OutputSchema,
  local: LocalRecords,
): Promise<OutputSchema> => {
  const feed = insertLocalPostsInFeed([...original.feed], local.paraPosts)
  return {
    ...original,
    feed,
  }
}
