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
import type * as ComParaCommunityDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.community.listSharedContent'

export type QueryParams = {
  communityUri: string
  contentType?:
    | 'post'
    | 'cabildeo'
    | 'collection'
    | 'mapInitiative'
    | 'external'
    | (string & {})
  includeRemoved: boolean
  includeChildren: boolean
  limit: number
  cursor?: string
}
export type InputSchema = undefined
export type OutputSchema = Output
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

export interface Output {
  $type?: 'com.para.community.listSharedContent#output'
  items: ComParaCommunityDefs.SharedContentView[]
  cursor?: string
}

const hashOutput = 'output'

export function isOutput<V>(v: V) {
  return is$typed(v, id, hashOutput)
}

export function validateOutput<V>(v: V) {
  return validate<Output & V>(v, id, hashOutput)
}
