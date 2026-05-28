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

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.social.getPostMeta'

export type QueryParams = {
  post: string
}
export type InputSchema = undefined

export interface OutputSchema {
  uri: string
  postType?: 'policy' | 'matter' | 'meme'
  official?: boolean
  party?: string
  community?: string
  category?: string
  tags?: string[]
  flairs?: string[]
  voteScore: number
  interactionMode: 'policy_ballot' | 'reddit_votes'
  createdAt?: string
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
