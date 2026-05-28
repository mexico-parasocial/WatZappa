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
const id = 'com.para.community.listIntensities'

export type QueryParams = {
  proposal: string
  limit?: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  intensities: IntensityView[]
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

export interface IntensityView {
  $type?: 'com.para.community.listIntensities#intensityView'
  uri: string
  cid: string
  proposal: string
  voter: string
  signal: number
  units: number
  creditsSpent?: number
  delegatedFrom?: string[]
  delegationDepth?: number
  effectiveWeight?: string
  createdAt: string
}

const hashIntensityView = 'intensityView'

export function isIntensityView<V>(v: V) {
  return is$typed(v, id, hashIntensityView)
}

export function validateIntensityView<V>(v: V) {
  return validate<IntensityView & V>(v, id, hashIntensityView)
}
