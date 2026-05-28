/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { HeadersMap, XRPCError } from '@atproto/xrpc'
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

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
  qp?: QueryParams
  encoding?: 'application/json'
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export class NotFoundError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class InvalidPhaseError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class DeadlineExpiredError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class InvalidOptionError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class VoteEditWindowExpiredError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class CommunityMembershipRequiredError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export function toKnownErr(e: any) {
  if (e instanceof XRPCError) {
    if (e.error === 'NotFound') return new NotFoundError(e)
    if (e.error === 'InvalidPhase') return new InvalidPhaseError(e)
    if (e.error === 'DeadlineExpired') return new DeadlineExpiredError(e)
    if (e.error === 'InvalidOption') return new InvalidOptionError(e)
    if (e.error === 'VoteEditWindowExpired')
      return new VoteEditWindowExpiredError(e)
    if (e.error === 'CommunityMembershipRequired')
      return new CommunityMembershipRequiredError(e)
  }

  return e
}

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
