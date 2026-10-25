import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { PipethroughUpstreamError, computeProxyTo, pipethrough } from '../../../../pipethrough.js'
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

/*
 * Read-after-write for a board in the viewer's own repo: when the AppView has
 * not indexed it yet, it is served from the repo. Once indexed, the AppView's
 * view (with its real member counts) is returned unchanged.
 */
export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.add(com.para.community.getBoard, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = com.para.community.getBoard.$lxm
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async ({ auth, req, params }) => {
      const viewerDid = auth.credentials.did
      try {
        return await pipethrough(ctx, req, { iss: viewerDid })
      } catch (err) {
        if (!(err instanceof PipethroughUpstreamError)) throw err

        const local = await ctx.actorStore.read(viewerDid, async (store) => {
          const board = await findLocalBoard({
            store,
            uri: params.uri,
            communityId: params.communityId,
          })
          if (!board) return null

          const [membership, governance, foundingMemberCount] =
            await Promise.all([
              getLocalMembership({ store, viewerDid, boardUri: board.uri }),
              getLocalGovernance({ store, creatorDid: viewerDid, board }),
              getFoundingMemberCount({ store, board }),
            ])

          // The creator's own board: createBoard always writes an owner
          // membership, so a missing one only means it was not readable.
          const viewerMembership = membership ?? {
            membershipState: 'active',
            roles: ['owner', 'moderator'],
          }

          return {
            board: {
              ...toGetBoardView({
                board,
                creatorDid: viewerDid,
                viewerMembershipState: viewerMembership.membershipState,
                viewerRoles: viewerMembership.roles,
                memberCount: foundingMemberCount,
              }),
              governanceSummary: toGovernanceSummary(governance),
            },
            viewerCapabilities: getViewerCapabilities(viewerMembership),
          }
        })

        if (!local) throw err
        return formatMungedResponse<com.para.community.getBoard.$OutputBody>(
          local,
        )
      }
    },
  })
}
