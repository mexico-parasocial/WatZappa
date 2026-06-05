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
const id = 'com.para.feed.searchPosts'

export type QueryParams = {
  q: string
  sort: 'top' | 'latest' | (string & {})
  since?: string
  until?: string
  mentions?: string
  author?: string
  lang?: string
  domain?: string
  url?: string
  tag?: string[]
  limit: number
  cursor?: string
  communityUris?: string[]
  cabildeoUris?: string[]
  politicalCompassPositions?: string[]
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  hitsTotal?: number
  posts: ComParaFeedGetAuthorFeed.PostView[]
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
