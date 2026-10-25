import { isHandleString } from '@atproto/lex'
import { parseCid } from '@atproto/lex-data'
import {
  AtUri,
  type AtUriString,
  type DatetimeString,
  type DidString,
} from '@atproto/syntax'
import type { AppContext } from '../../../../context.js'
import type { com } from '../../../../lexicons/index.js'
import type {
  ParaPostRecord,
  RecordDescript,
} from '../../../../read-after-write/index.js'

export type PostView = com.para.feed.getAuthorFeed.PostView

export const toPostView = ({
  uri,
  cid,
  record,
}: RecordDescript<ParaPostRecord>): PostView => ({
  uri: uri.toString() as AtUriString,
  cid: cid.toString(),
  author: uri.host as DidString,
  text: record.text,
  createdAt: record.createdAt as DatetimeString,
  replyRoot: record.reply?.root.uri as AtUriString | undefined,
  replyParent: record.reply?.parent.uri as AtUriString | undefined,
  langs: record.langs?.length ? record.langs : undefined,
  tags: record.tags?.length ? record.tags : undefined,
  flairs: record.flairs?.length ? record.flairs : undefined,
  postType: record.postType,
})

export const toRecordDescript = (
  record: { uri: string; cid: string; value: unknown },
  indexedAt: string,
): RecordDescript<ParaPostRecord> => ({
  uri: new AtUri(record.uri),
  cid: parseCid(record.cid),
  indexedAt: indexedAt as DatetimeString,
  record: record.value as ParaPostRecord,
})

export const insertLocalPostsInFeed = (
  feed: PostView[],
  paraPosts: RecordDescript<ParaPostRecord>[],
): PostView[] => {
  if (paraPosts.length === 0) return feed

  const urisInFeed = new Set<string>(feed.map((item) => item.uri))
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
): Promise<DidString | undefined> => {
  if (actor.startsWith('did:')) return actor as DidString
  if (!isHandleString(actor)) return undefined
  return (await ctx.accountManager.getDidForActor(actor)) ?? undefined
}

export const resolveDidUri = async (
  ctx: AppContext,
  uri: string,
): Promise<AtUri> => {
  const resolved = new AtUri(uri)
  if (resolved.hostname.startsWith('did:')) return resolved
  if (isHandleString(resolved.hostname)) {
    const account = await ctx.accountManager.getAccount(resolved.hostname)
    if (account) {
      resolved.hostname = account.did
    }
  }
  return resolved
}
