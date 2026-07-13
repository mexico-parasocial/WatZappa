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
const id = 'com.para.feed.searchPosts'

export type QueryParams = {
  q: string
  sort?: 'top' | 'latest' | (string & {})
  since?: string
  until?: string
  mentions?: string
  author?: string
  lang?: string
  domain?: string
  url?: string
  tag?: string[]
  limit?: number
  cursor?: string
  communityUris?: string[]
  cabildeoUris?: string[]
  politicalCompassPositions?: string[]
  postType?: string
  flairs?: string[]
  party?: string
  verifiedPublicFigure?: boolean
  state?: string
  districtKey?: string
  cabildeoPhase?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  hitsTotal?: number
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
