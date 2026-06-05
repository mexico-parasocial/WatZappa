// @ts-nocheck
import { AtUri } from '@atproto/syntax'
import { AppContext } from '../../../../context.js'
import { PostView } from '../../../../lexicon/types/com/para/feed/getAuthorFeed.js'
import { Record as ParaPostRecord } from '../../../../lexicon/types/com/para/post.js'
import { RecordDescript } from '../../../../read-after-write/index.js'

export const toPostView = (
  descript: RecordDescript<ParaPostRecord>,
): PostView => {
  const { uri, cid, record } = descript

  return {
    uri: uri.toString(),
    cid: cid.toString(),
    author: uri.host,
    text: record.text,
    createdAt: record.createdAt,
    replyRoot: record.reply?.root.uri,
    replyParent: record.reply?.parent.uri,
    langs: record.langs?.length ? record.langs : undefined,
    tags: record.tags?.length ? record.tags : undefined,
    flairs: record.flairs?.length ? record.flairs : undefined,
    postType: record.postType,
  }
}

export const insertLocalPostsInFeed = (
  feed: PostView[],
  paraPosts: RecordDescript<ParaPostRecord>[],
): PostView[] => {
  if (paraPosts.length === 0) return feed

  const urisInFeed = new Set(feed.map((item) => item.uri))
  const lastCreatedAt = feed.at(-1)?.createdAt ?? new Date(0).toISOString()
  const local = paraPosts
    .filter((post) => post.record.createdAt > lastCreatedAt)
    .map(toPostView)
    .filter((post) => !urisInFeed.has(post.uri))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  for (const post of local) {
    const idx = feed.findIndex((item) => item.createdAt < post.createdAt)
    if (idx >= 0) {
      feed.splice(idx, 0, post)
    } else {
      feed.push(post)
    }
    urisInFeed.add(post.uri)
  }

  return feed
}

export const resolveLocalActorDid = async (
  ctx: AppContext,
  actor: string,
): Promise<string | undefined> => {
  if (actor.startsWith('did:')) return actor
  return (await ctx.accountManager.getDidForActor(actor)) ?? undefined
}

export const resolveDidUri = async (
  ctx: AppContext,
  uri: string,
): Promise<AtUri> => {
  const resolved = new AtUri(uri as AtUri['href'])
  if (resolved.hostname.startsWith('did:')) return resolved
  const account = await ctx.accountManager.getAccount(resolved.hostname)
  if (account) {
    resolved.hostname = account.did
  }
  return resolved
}
