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
const id = 'com.para.civic.listDelegationCandidates'

export type QueryParams = {
  cabildeo: string
  communityId?: string
  limit: number
  cursor?: string
}
export type InputSchema = undefined
export type OutputSchema = Output
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

export interface CandidateView {
  $type?: 'com.para.civic.listDelegationCandidates#candidateView'
  did: string
  handle?: string
  displayName?: string
  avatar?: string
  description?: string
  roles: string[]
  activeDelegationCount: number
  hasVoted: boolean
  votedAt?: string
  selectedOption?: number
}

const hashCandidateView = 'candidateView'

export function isCandidateView<V>(v: V) {
  return is$typed(v, id, hashCandidateView)
}

export function validateCandidateView<V>(v: V) {
  return validate<CandidateView & V>(v, id, hashCandidateView)
}

export interface Output {
  $type?: 'com.para.civic.listDelegationCandidates#output'
  candidates: CandidateView[]
  cursor?: string
}

const hashOutput = 'output'

export function isOutput<V>(v: V) {
  return is$typed(v, id, hashOutput)
}

export function validateOutput<V>(v: V) {
  return validate<Output & V>(v, id, hashOutput)
}
