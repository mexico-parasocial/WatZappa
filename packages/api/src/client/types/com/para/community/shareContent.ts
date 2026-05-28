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
import type * as ComAtprotoRepoStrongRef from '../../atproto/repo/strongRef.js'
import type * as ComParaCommunityDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.community.shareContent'

export type QueryParams = {}

export interface InputSchema {
  subject: ComAtprotoRepoStrongRef.Main
  communityUri: string
  contentType:
    | 'post'
    | 'cabildeo'
    | 'collection'
    | 'mapInitiative'
    | 'external'
    | (string & {})
  note?: string
  visibility?: 'community' | 'public' | 'stewards' | (string & {})
  sourceApp?: string
  embedContext?: { [_ in string]: unknown }
  pinned?: boolean
  sortRank?: number
}

export type OutputSchema = Output

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

export interface Output {
  $type?: 'com.para.community.shareContent#output'
  uri: string
  cid: string
  sharedContent: ComParaCommunityDefs.SharedContentView
}

const hashOutput = 'output'

export function isOutput<V>(v: V) {
  return is$typed(v, id, hashOutput)
}

export function validateOutput<V>(v: V) {
  return validate<Output & V>(v, id, hashOutput)
}
