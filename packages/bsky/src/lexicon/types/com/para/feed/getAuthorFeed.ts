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
const id = 'com.para.feed.getAuthorFeed'

export type QueryParams = {
  /** Handle or DID of the actor. */
  actor: string
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
  feed: PostView[]
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
  error?: 'BlockedActor' | 'BlockedByActor'
}

export type HandlerOutput = HandlerError | HandlerSuccess

export interface PostView {
  $type?: 'com.para.feed.getAuthorFeed#postView'
  uri: string
  cid: string
  author: string
  text: string
  createdAt: string
  replyRoot?: string
  replyParent?: string
  langs?: string[]
  tags?: string[]
  flairs?: string[]
  postType?: string
}

const hashPostView = 'postView'

export function isPostView<V>(v: V) {
  return is$typed(v, id, hashPostView)
}

export function validatePostView<V>(v: V) {
  return validate<PostView & V>(v, id, hashPostView)
}
