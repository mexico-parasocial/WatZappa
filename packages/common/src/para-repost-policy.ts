/**
 * PARA does not have reposts. Sharing a post means quoting it or highlighting
 * part of it, so a repost record is refused on write by `@atproto/pds`
 * (`repo/prepare.ts`) and skipped on index by `@atproto/bsky`
 * (`data-plane/server/indexing`). The indexing check covers reposts written
 * by other PDSes too. Deletes still go through, so removing an old repost
 * still works.
 *
 * The `app.bsky.feed.repost` lexicon, its generated types and its tables stay:
 * dropping them would break atproto compatibility and every upstream sync.
 *
 * Operators who need upstream behavior (the upstream test suites, which seed
 * reposts) opt back in with PARA_REPOSTS_ENABLED=1. Refusing by default means
 * a deployment that forgets the variable still behaves like PARA.
 *
 * @NOTE a string literal rather than the generated `$type` constant, because
 * this package has no lexicon codegen.
 */
export const REPOST_COLLECTION = 'app.bsky.feed.repost'

export function repostsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PARA_REPOSTS_ENABLED === '1'
}

export function repostWriteRefusal(
  collection: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (collection !== REPOST_COLLECTION || repostsEnabled(env)) return undefined
  return `${REPOST_COLLECTION} is not supported on PARA: share a post by quoting it (app.bsky.feed.post with an embed) instead.`
}
