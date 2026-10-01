// @ts-nocheck
/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { HeadersMap, XRPCError } from '@atproto/xrpc'
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util.js'
import type * as AppBskyFeedDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'app.bsky.feed.getListFeed'

export type QueryParams = {
  /** Reference (AT-URI) to the list record. */
  list: string
  limit?: number
  cursor?: string
  /** Return only items newer than the position identified by this cursor value, newest first. Use the startCursor from a previous response. The item at that position is not returned because the caller already holds it. When the bounded range is exhausted, the returned cursor equals this value so that pagination continues below the boundary. */
  since?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  /** Cursor identifying the newest item in this page. Pass it as since on a later request to fetch only newer content. */
  startCursor?: string
  feed: AppBskyFeedDefs.FeedViewPost[]
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export class UnknownListError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export function toKnownErr(e: any) {
  if (e instanceof XRPCError) {
    if (e.error === 'UnknownList') return new UnknownListError(e)
  }

  return e
}
