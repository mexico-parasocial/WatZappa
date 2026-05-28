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
import type * as ComParaCivicDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.civic.listCabildeos'

export type QueryParams = {
  /** Optional community filter. */
  community?: string
  /** Optional phase filter. */
  phase?:
    | 'draft'
    | 'open'
    | 'deliberating'
    | 'voting'
    | 'resolved'
    | (string & {})
  limit?: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  cabildeos: ComParaCivicDefs.CabildeoView[]
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export function toKnownErr(e: any) {
  return e
}
