import type { Cid } from '@atproto/lex-data'
import type { AtUri, DatetimeString } from '@atproto/syntax'
import type { app } from '../lexicons/index.js'
import type { ParaPostRecord } from '../para/read-after-write.js'
import type { LocalViewer } from './viewer.js'

export {
  PARA_POST_COLLECTION,
  type ParaPostRecord,
} from '../para/read-after-write.js'

export type LocalRecords = {
  count: number
  profile: RecordDescript<app.bsky.actor.profile.Main> | null
  posts: RecordDescript<app.bsky.feed.post.Main>[]
  paraPosts: RecordDescript<ParaPostRecord>[]
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
