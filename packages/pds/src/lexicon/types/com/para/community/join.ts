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
const id = 'com.para.community.join'

export type QueryParams = {}

export interface InputSchema {
  /** URI of the com.para.community.board record to join. */
  communityUri: string
  /** Optional source label for how the viewer joined. */
  source?: string
}

export type OutputSchema = Output

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
}

export type HandlerOutput = HandlerError | HandlerSuccess

export interface Output {
  $type?: 'com.para.community.join#output'
  uri: string
  cid: string
  communityUri: string
  membershipState:
    | 'pending'
    | 'active'
    | 'left'
    | 'removed'
    | 'blocked'
    | (string & {})
  viewerCapabilities: string[]
}

const hashOutput = 'output'

export function isOutput<V>(v: V) {
  return is$typed(v, id, hashOutput)
}

export function validateOutput<V>(v: V) {
  return validate<Output & V>(v, id, hashOutput)
}
