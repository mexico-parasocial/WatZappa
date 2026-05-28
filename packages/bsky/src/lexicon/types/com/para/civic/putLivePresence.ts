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
const id = 'com.para.civic.putLivePresence'

export type QueryParams = {}

export interface InputSchema {
  cabildeo: string
  sessionId: string
  present: boolean
}

export interface OutputSchema {
  cabildeo: string
  present: boolean
  expiresAt?: string
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
  error?: 'NotFound' | 'InvalidPhase' | 'LiveStatusRequired'
}

export type HandlerOutput = HandlerError | HandlerSuccess
