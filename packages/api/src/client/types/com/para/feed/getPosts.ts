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
import type * as ComParaFeedGetAuthorFeed from './getAuthorFeed.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.feed.getPosts'

export type QueryParams = {
  /** List of Para post AT-URIs to return. */
  uris: string[]
}
export type InputSchema = undefined

export interface OutputSchema {
  posts: ComParaFeedGetAuthorFeed.PostView[]
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

export function toKnownErr(e: any) {
  return e
}
