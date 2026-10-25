import type { DidString } from '@atproto/syntax'
import type { Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { computeProxyTo } from '../../../../pipethrough.js'
import {
  type MungeFn,
  pipethroughReadAfterWrite,
} from '../../../../read-after-write/index.js'
import {
  type LocalBoard,
  getFoundingMemberCount,
  getLocalMembership,
  listLocalBoards,
  normalizeSlug,
  toListBoardView,
} from './util.js'

type Params = com.para.community.listBoards.$Params

/*
 * Read-after-write: when the viewer's repo has records the AppView has not
 * indexed yet, the viewer's boards missing from the first page are added to
 * it. Only filters that can be evaluated from the board record itself are
 * applied to them; a request using any other filter is returned as the
 * AppView answered it.
 */
export default function (server: Server, ctx: AppContext) {
  if (!ctx.bskyAppView) return

  server.add(com.para.community.listBoards, {
    auth: ctx.authVerifier.authorization({
      authorize: (permissions, { req }) => {
        const lxm = com.para.community.listBoards.$lxm
        const aud = computeProxyTo(ctx, req, lxm)
        permissions.assertRpc({ aud, lxm })
      },
    }),
    handler: async (reqCtx) => {
      return pipethroughReadAfterWrite(
        ctx,
        reqCtx,
        com.para.community.listBoards,
        listBoardsMunge(reqCtx.params),
      )
    },
  })
}

const listBoardsMunge =
  (params: Params): MungeFn<com.para.community.listBoards.$OutputBody> =>
  async (localViewer, original, _local, requester) => {
    if (
      params.cursor ||
      params.state ||
      params.participationKind ||
      params.flairId
    ) {
      return original
    }

    const limit = params.limit ?? 50
    const seen = new Set(original.boards.map((board) => board.uri as string))
    const viewerDid = requester as DidString

    const store = localViewer.actorStoreReader
    const boards = (await listLocalBoards(store, limit)).filter(
      (board) => !seen.has(board.uri) && matchesParams(board, params),
    )
    const localBoards = await Promise.all(
      boards.map(async (board) => {
        const [membership, foundingMemberCount] = await Promise.all([
          getLocalMembership({ store, viewerDid, boardUri: board.uri }),
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

    if (localBoards.length === 0) return original
    return {
      ...original,
      boards: [...localBoards, ...original.boards].slice(0, limit),
    }
  }

const matchesParams = (board: LocalBoard, params: Params) => {
  const { record } = board
  if (params.region && record.region !== params.region) return false
  if (params.quadrant && record.quadrant !== params.quadrant) return false
  if (params.query) {
    const query = normalizeSlug(params.query)
    const haystack = normalizeSlug(`${record.name} ${record.description ?? ''}`)
    if (query && !haystack.includes(query)) return false
  }
  return true
}
