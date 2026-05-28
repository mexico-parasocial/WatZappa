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
const id = 'com.para.raq.getProposals'

export type QueryParams = {
  community?: string
  limit: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  proposals: ProposalView[]
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

export interface ProposalView {
  $type?: 'com.para.raq.getProposals#proposalView'
  uri: string
  cid: string
  creator: string
  text: string
  targetAxis?: string
  targetCommunity?: string
  upvotes: number
  downvotes: number
  answerCount?: number
  answerAverage?: number
  viewerUpvote?: boolean
  viewerDownvote?: boolean
  viewerAnswer?: number
  createdAt: string
  indexedAt?: string
}

const hashProposalView = 'proposalView'

export function isProposalView<V>(v: V) {
  return is$typed(v, id, hashProposalView)
}

export function validateProposalView<V>(v: V) {
  return validate<ProposalView & V>(v, id, hashProposalView)
}
