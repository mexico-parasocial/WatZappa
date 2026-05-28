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
const id = 'com.para.alpha.requestAccess'

export type QueryParams = {}

export interface InputSchema {
  /** Mexican state abbreviation or name */
  state: string
  /** Optional invite code in format STATE-XXXX-XXXX */
  inviteCode?: string
}

export interface OutputSchema {
  status:
    | 'approved'
    | 'waitlisted'
    | 'rejected'
    | 'already_has_access'
    | (string & {})
  position?: number
  state?: string
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

export function toKnownErr(e: any) {
  return e
}
