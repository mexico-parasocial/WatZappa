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
const id = 'com.para.alpha.getRolloutStatus'

export type QueryParams = {}
export type InputSchema = undefined

export interface OutputSchema {
  states: StateStatus[]
}

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
