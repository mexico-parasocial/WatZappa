/**
 * GENERATED CODE - DO NOT MODIFY
 */
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
  depth: number
}
export type InputSchema = undefined

export interface OutputSchema {
  post: ComParaFeedGetAuthorFeed.PostView
  replies: ReplyView[]
}

export type HandlerInput = void

export interface HandlerSuccess {
  encoding: 'application/json'
  body: OutputSchema
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
  error?: 'NotFound'
}

export type HandlerOutput = HandlerError | HandlerSuccess

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
