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
const id = 'com.para.community.listDeliberationVotes'

export type QueryParams = {
  statement: string
  direction?: 'agree' | 'disagree' | 'pass'
  limit: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  votes: VoteView[]
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

export interface VoteView {
  $type?: 'com.para.community.listDeliberationVotes#voteView'
  uri: string
  cid: string
  statement: string
  voter: string
  direction: 'agree' | 'disagree' | 'pass'
  createdAt: string
}

const hashVoteView = 'voteView'

export function isVoteView<V>(v: V) {
  return is$typed(v, id, hashVoteView)
}

export function validateVoteView<V>(v: V) {
  return validate<VoteView & V>(v, id, hashVoteView)
}
