// @ts-nocheck
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
import type * as AppBskyFeedDefs from '../../../app/bsky/feed/defs.js'
import type * as ComParaSocialGetPostMeta from '../social/getPostMeta.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.feed.getMemes'

export type QueryParams = {
  limit: number
  cursor?: string
  party?: string
  community?: string
  state?: string
  category?: string
  /** Filter by an exact Para flair tag. */
  flairTag?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  feed: MemeView[]
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
}

export type HandlerOutput = HandlerError | HandlerSuccess

export interface MemeView {
  $type?: 'com.para.feed.getMemes#memeView'
  post: AppBskyFeedDefs.PostView
  meta?: ComParaSocialGetPostMeta.PostMeta
}

const hashMemeView = 'memeView'

export function isMemeView<V>(v: V) {
  return is$typed(v, id, hashMemeView)
}

export function validateMemeView<V>(v: V) {
  return validate<MemeView & V>(v, id, hashMemeView)
}
