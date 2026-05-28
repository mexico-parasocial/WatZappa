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
const id = 'com.para.discourse.getTopics'

export type QueryParams = {
  community: string
  limit: number
}
export type InputSchema = undefined

export interface OutputSchema {
  topics: Topic[]
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

export interface Topic {
  $type?: 'com.para.discourse.getTopics#topic'
  label: string
  /** Relative importance/frequency (0-100) */
  weight: number
  /** Percentage change in mentions over the last period */
  growthRate: number
  relatedKeywords?: string[]
}

const hashTopic = 'topic'

export function isTopic<V>(v: V) {
  return is$typed(v, id, hashTopic)
}

export function validateTopic<V>(v: V) {
  return validate<Topic & V>(v, id, hashTopic)
}
