// @ts-nocheck
import { jsonToLex } from '@atproto/lexicon'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { ids } from '../../../../lexicon/lexicons.js'
import { OutputSchema } from '../../../../lexicon/types/com/para/community/listBoards.js'
import {
  asPipeThroughBuffer,
  computeProxyTo,
  isJsonContentType,
  pipethrough,
} from '../../../../pipethrough.js'
import { formatMungedResponse } from '../../../../read-after-write/index.js'
import {
  getFoundingMemberCount,
  getLocalMembership,
  listLocalBoards,
  toListBoardView,
} from './util.js'

export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.com.para.community.listBoards({
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = ids.ComParaCommunityListBoards
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async ({ auth, req, params }) => {
      const viewerDid = auth.credentials.did
      const streamRes = await pipethrough(ctx, req, { iss: viewerDid })

      const localBoards = await ctx.actorStore.read(
        viewerDid,
        async (store) => {
          const boards = await listLocalBoards(store, params.limit || 50)
          return Promise.all(
            boards.map(async (board) => {
              const [membership, foundingMemberCount] = await Promise.all([
                getLocalMembership({
                  store,
                  viewerDid,
                  boardUri: board.uri,
                }),
                getFoundingMemberCount({ store, board }),
              ])

              return toListBoardView({
                board,
                creatorDid: viewerDid,
                viewerMembershipState: membership?.membershipState ?? 'active',
                viewerRoles: membership?.roles ?? ['owner', 'moderator'],
                memberCount: foundingMemberCount,
              })
            }),
          )
        },
      )

      if (localBoards.length === 0) {
        return streamRes
      }

      if (isJsonContentType(streamRes.headers['content-type']) === false) {
        return streamRes
      }

      let bufferRes: Awaited<ReturnType<typeof asPipeThroughBuffer>> | undefined
      try {
        const { buffer } = (bufferRes = await asPipeThroughBuffer(streamRes))
        const body = jsonToLex(
          JSON.parse(buffer.toString('utf8')),
        ) as OutputSchema
        const seen = new Set(body.boards.map((board) => board.uri))
        const mergedBoards = [
          ...localBoards.filter((board) => !seen.has(board.uri)),
          ...body.boards,
        ]

        return formatMungedResponse<OutputSchema>({
          ...body,
          boards: mergedBoards.slice(0, params.limit || 50),
        })
      } catch {
        return bufferRes ?? streamRes
      }
    },
  })
}
