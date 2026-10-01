import type { DidString } from '@atproto/syntax'
import { InvalidRequestError, UpstreamFailureError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { dbLogger } from '../../../../logger.js'
import { listLocalBoards, normalizeSlug } from './util.js'

/*
 * Community names are unique across PARA: two boards with the same name cannot
 * be told apart in any picker, feed or profile link.
 *
 * A board lives in its creator's repo, so this PDS cannot see other accounts'
 * boards directly. The check therefore has two halves: the creator's own repo
 * (which also covers boards the AppView has not indexed yet) and the AppView's
 * index of everyone else's. It is a check-then-write, not a constraint, so two
 * creators racing on a brand new name can still both succeed; the AppView list
 * then shows both and the later one should be renamed.
 */

export const COMMUNITY_NAME_TAKEN = 'CommunityNameTaken'

/** How many AppView result pages to read when looking for an exact name. */
const MAX_LOOKUP_PAGES = 3

type NamedBoard = { uri: string; name: string }

/**
 * The first board whose name is the same as `name` once case, accents and
 * punctuation are ignored. `ownBoardUri` is the board being re-submitted by its
 * own creator (createBoard is idempotent), which is not a conflict with itself.
 */
export const findCommunityNameConflict = (
  boards: NamedBoard[],
  name: string,
  ownBoardUri?: string,
): NamedBoard | undefined => {
  const wanted = normalizeSlug(name)
  if (!wanted) return undefined
  return boards.find(
    (board) =>
      board.uri !== ownBoardUri && normalizeSlug(board.name) === wanted,
  )
}

export const assertCommunityNameAvailable = async ({
  ctx,
  did,
  name,
  ownBoardUri,
}: {
  ctx: AppContext
  did: DidString
  name: string
  ownBoardUri?: string
}) => {
  const taken = () =>
    new InvalidRequestError(
      `A community named "${name}" already exists. Choose a different name.`,
      COMMUNITY_NAME_TAKEN,
    )

  // The creator's own repo: authoritative, and needs no network.
  const local = await ctx.actorStore.read(did, (store) =>
    listLocalBoards(store, 100),
  )
  const localConflict = findCommunityNameConflict(
    local.map((board) => ({ uri: board.uri, name: board.record.name })),
    name,
    ownBoardUri,
  )
  if (localConflict) throw taken()

  // Everyone else's boards, from the AppView index.
  if (!ctx.bskyAppView) return
  try {
    const headers = await ctx.appviewAuthHeaders(
      did,
      com.para.community.listBoards.$lxm,
    )
    let cursor: string | undefined
    for (let page = 0; page < MAX_LOOKUP_PAGES; page++) {
      const res = await ctx.bskyAppView.client.call(
        com.para.community.listBoards,
        { query: name, limit: 100, cursor },
        headers,
      )
      if (findCommunityNameConflict(res.boards, name, ownBoardUri)) {
        throw taken()
      }
      cursor = res.cursor
      if (!cursor) return
    }
  } catch (err) {
    if (err instanceof InvalidRequestError) throw err
    // Better to refuse than to quietly allow the duplicate the rule exists to
    // prevent; the creator can simply try again.
    dbLogger.error({ err, did, name }, 'createBoard.nameCheckFailed')
    throw new UpstreamFailureError(
      'Could not verify that the community name is available. Try again.',
    )
  }
}
