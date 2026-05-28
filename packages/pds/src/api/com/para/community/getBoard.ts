// @ts-nocheck
import { jsonToLex } from '@atproto/lexicon'
import { AppContext } from '../../../../context.js'
import { Server } from '../../../../lexicon/index.js'
import { ids } from '../../../../lexicon/lexicons.js'
import { OutputSchema } from '../../../../lexicon/types/com/para/community/getBoard.js'
import {
  asPipeThroughBuffer,
  computeProxyTo,
  isJsonContentType,
  pipethrough,
} from '../../../../pipethrough.js'
import { formatMungedResponse } from '../../../../read-after-write/index.js'
import {
  findLocalBoard,
  getFoundingMemberCount,
  getLocalGovernance,
  getLocalMembership,
  getViewerCapabilities,
  toGetBoardView,
  toGovernanceSummary,
} from './util.js'

export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.com.para.community.getBoard({
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = ids.ComParaCommunityGetBoard
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async ({ auth, req, params }) => {
      const viewerDid = auth.credentials.did

      const local = await ctx.actorStore.read(viewerDid, async (store) => {
        const board = await findLocalBoard({
          store,
          uri: params.uri,
          communityId: params.communityId,
        })
        if (!board) return null

        const [membership, governance, foundingMemberCount] = await Promise.all(
          [
            getLocalMembership({ store, viewerDid, boardUri: board.uri }),
            getLocalGovernance({ store, creatorDid: viewerDid, board }),
            getFoundingMemberCount({ store, board }),
          ],
        )

        return {
          board: toGetBoardView({
            board,
            creatorDid: viewerDid,
            viewerMembershipState: membership?.membershipState ?? 'active',
            viewerRoles: membership?.roles ?? ['owner', 'moderator'],
            memberCount: foundingMemberCount,
          }),
          viewerCapabilities: getViewerCapabilities(
            membership ?? {
              membershipState: 'active',
              roles: ['owner', 'moderator'],
            },
          ),
          governanceSummary: toGovernanceSummary(governance),
        }
      })

      if (local) {
        return formatMungedResponse<OutputSchema>({
          board: {
            ...local.board,
            governanceSummary: local.governanceSummary,
          },
          viewerCapabilities: local.viewerCapabilities,
        })
      }

      const streamRes = await pipethrough(ctx, req, { iss: viewerDid })
      if (isJsonContentType(streamRes.headers['content-type']) === false) {
        return streamRes
      }

      let bufferRes: Awaited<ReturnType<typeof asPipeThroughBuffer>> | undefined
      try {
        const { buffer } = (bufferRes = await asPipeThroughBuffer(streamRes))
        const body = jsonToLex(
          JSON.parse(buffer.toString('utf8')),
        ) as OutputSchema
        return formatMungedResponse(body)
      } catch {
        return bufferRes ?? streamRes
      }
    },
  })
}
