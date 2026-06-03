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
import type * as ComParaCommunityDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.community.updateBriefingPack'

export type QueryParams = {}

export interface InputSchema {
  uri: string
  cid?: string
  pack: PackInput
}

export interface OutputSchema {
  pack: ComParaCommunityDefs.BriefingPackView
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

export interface PackInput {
  $type?: 'com.para.community.updateBriefingPack#packInput'
  party?: string
  title?: string
  summary?: string
  cabildeoUris?: string[]
  civicTreeCardIds?: string[]
  evidenceUris?: string[]
  sembleCollectionUri?: string
  marginCollectionUri?: string
  obsidianExportUri?: string
  status?: 'draft' | 'published' | 'archived'
}

const hashPackInput = 'packInput'

export function isPackInput<V>(v: V) {
  return is$typed(v, id, hashPackInput)
}

export function validatePackInput<V>(v: V) {
  return validate<PackInput & V>(v, id, hashPackInput)
}
