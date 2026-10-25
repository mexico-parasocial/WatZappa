import type { Cid } from '@atproto/lex-data'
import type { AtUri, DatetimeString } from '@atproto/syntax'
import type { app } from '../lexicons/index.js'
import type { LocalViewer } from './viewer.js'

export type LocalRecords = {
  count: number
  profile: RecordDescript<app.bsky.actor.profile.Main> | null
  posts: RecordDescript<app.bsky.feed.post.Main>[]
  paraPosts: RecordDescript<ParaPostRecord>[]
}

export const PARA_POST_COLLECTION = 'com.para.post'

/**
 * The fields of a `com.para.post` record that read-after-write reads. The
 * record lexicon is not part of this PDS's manifest, so this is structural.
 */
export type ParaPostRecord = {
  $type: typeof PARA_POST_COLLECTION
  text: string
  createdAt: string
  reply?: { root: { uri: string }; parent: { uri: string } }
  langs?: string[]
  tags?: string[]
  flairs?: string[]
  postType?: string
}

export type RecordDescript<T> = {
  uri: AtUri
  cid: Cid
  indexedAt: DatetimeString
  record: T
}

export type ApiRes<T> = {
  headers: Record<string, string | undefined>
  data: T
}

export type MungeFn<T> = (
  localViewer: LocalViewer,
  original: T,
  local: LocalRecords,
  requester: string,
) => Promise<T>

export type HandlerResponse<T> = {
  encoding: 'application/json'
  body: T
  headers?: Record<string, string>
}
