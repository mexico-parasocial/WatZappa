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
const id = 'com.para.alpha.getRolloutStatus'

export type QueryParams = {}
export type InputSchema = undefined

export interface OutputSchema {
  states: StateStatus[]
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

export interface StateStatus {
  $type?: 'com.para.alpha.getRolloutStatus#stateStatus'
  state: string
  totalSlots: number
  usedSlots: number
  isOpen: boolean
  openedAt?: string
}

const hashStateStatus = 'stateStatus'

export function isStateStatus<V>(v: V) {
  return is$typed(v, id, hashStateStatus)
}

export function validateStateStatus<V>(v: V) {
  return validate<StateStatus & V>(v, id, hashStateStatus)
}
