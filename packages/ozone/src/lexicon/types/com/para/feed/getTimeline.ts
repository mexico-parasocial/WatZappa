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
import type * as ComParaFeedGetAuthorFeed from './getAuthorFeed.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.feed.getTimeline'

export type QueryParams = {
  limit: number
  cursor?: string
  party?: string
  community?: string
  /** Filter by an exact Para flair tag, e.g. |#Sanidad or ||#TransportePublico. */
  flairTag?: string
  /** Filter by post type, e.g. meme, proposal, debate. */
  postType?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  feed: ComParaFeedGetAuthorFeed.PostView[]
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
