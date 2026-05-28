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
const id = 'com.para.community.listDeliberations'

export type QueryParams = {
  proposal: string
  stance?: 'for' | 'against' | 'neutral' | 'bridging'
  limit: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  statements: StatementView[]
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

export interface StatementView {
  $type?: 'com.para.community.listDeliberations#statementView'
  uri: string
  cid: string
  creator: string
  proposal: string
  body: string
  stance: 'for' | 'against' | 'neutral' | 'bridging'
  agreeCount: number
  disagreeCount: number
  passCount: number
  createdAt: string
}

const hashStatementView = 'statementView'

export function isStatementView<V>(v: V) {
  return is$typed(v, id, hashStatementView)
}

export function validateStatementView<V>(v: V) {
  return validate<StatementView & V>(v, id, hashStatementView)
}
