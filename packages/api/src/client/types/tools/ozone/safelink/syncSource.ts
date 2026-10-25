// @ts-nocheck
/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type HeadersMap, XRPCError } from '@atproto/xrpc'
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util.js'
import type * as ToolsOzoneSafelinkDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'tools.ozone.safelink.syncSource'

export type QueryParams = {}

export interface InputSchema {
  /** Source whose rules are being synchronized */
  source: string
  rules: SourceRule[]
}

export interface OutputSchema {
  added: number
  updated: number
  removed: number
  events: number
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

export interface SourceRule {
  $type?: 'tools.ozone.safelink.syncSource#sourceRule'
  url: string
  pattern: ToolsOzoneSafelinkDefs.PatternType
  action: ToolsOzoneSafelinkDefs.ActionType
  reason: ToolsOzoneSafelinkDefs.ReasonType
}

const hashSourceRule = 'sourceRule'

export function isSourceRule<V>(v: V) {
  return is$typed(v, id, hashSourceRule)
}

export function validateSourceRule<V>(v: V) {
  return validate<SourceRule & V>(v, id, hashSourceRule)
}
