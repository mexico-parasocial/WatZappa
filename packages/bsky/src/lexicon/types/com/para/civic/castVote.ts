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
const id = 'com.para.civic.castVote'

export type QueryParams = {}

export interface InputSchema {
  cabildeo: string
  selectedOption: number
  /** Privacy-preserving one-person-one-vote nullifier for this cabildeo. */
  voteNullifier?: string
  /** Opaque m8 proof reference for the vote nullifier. */
  eligibilityProofRef?: string
}

export interface OutputSchema {
  uri: string
  cid: string
  commit: Commit
}

export interface HandlerInput {
  encoding: 'application/json'
  body: InputSchema
}

export interface HandlerSuccess {
  encoding: 'application/json'
  body: OutputSchema
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
  error?:
    | 'NotFound'
    | 'InvalidPhase'
    | 'DeadlineExpired'
    | 'InvalidOption'
    | 'VoteEditWindowExpired'
    | 'CommunityMembershipRequired'
}

export type HandlerOutput = HandlerError | HandlerSuccess

export interface Commit {
  $type?: 'com.para.civic.castVote#commit'
  cid: string
  rev: string
}

const hashCommit = 'commit'

export function isCommit<V>(v: V) {
  return is$typed(v, id, hashCommit)
}

export function validateCommit<V>(v: V) {
  return validate<Commit & V>(v, id, hashCommit)
}
