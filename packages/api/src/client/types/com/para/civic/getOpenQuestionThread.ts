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
import type * as ComParaFeedGetAuthorFeed from '../feed/getAuthorFeed.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.civic.getOpenQuestionThread'

export type QueryParams = {
  /** AT-URI of the open question post. */
  uri: string
  /** How many levels of reply depth to include. */
  depth?: number
}
export type InputSchema = undefined

export interface OutputSchema {
  post: ComParaFeedGetAuthorFeed.PostView
  replies: ReplyView[]
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

export class NotFoundError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export function toKnownErr(e: any) {
  if (e instanceof XRPCError) {
    if (e.error === 'NotFound') return new NotFoundError(e)
  }

  return e
}

export interface ReplyView {
  $type?: 'com.para.civic.getOpenQuestionThread#replyView'
  uri: string
  cid: string
  author: string
  text: string
  createdAt: string
  /** Net vote score (upvotes - downvotes). */
  voteScore: number
  /** Current viewer's vote: -1, 0, or 1. */
  viewerVote?: number
  replies?: ReplyView[]
}

const hashReplyView = 'replyView'

export function isReplyView<V>(v: V) {
  return is$typed(v, id, hashReplyView)
}

export function validateReplyView<V>(v: V) {
  return validate<ReplyView & V>(v, id, hashReplyView)
}
