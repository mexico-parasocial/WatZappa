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
import type * as ComAtprotoRepoStrongRef from '../../atproto/repo/strongRef.js'
import type * as ComParaCommunityDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.community.removeSharedContent'

export type QueryParams = {}
export type InputSchema = Input
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

export interface Input {
  $type?: 'com.para.community.removeSharedContent#input'
  sharedContent: ComAtprotoRepoStrongRef.Main
  communityUri: string
  note?: string
}

const hashInput = 'input'

export function isInput<V>(v: V) {
  return is$typed(v, id, hashInput)
}

export function validateInput<V>(v: V) {
  return validate<Input & V>(v, id, hashInput)
}

export interface Output {
  $type?: 'com.para.community.removeSharedContent#output'
  uri: string
  cid: string
  action: ComParaCommunityDefs.SharedContentActionView
}

const hashOutput = 'output'

export function isOutput<V>(v: V) {
  return is$typed(v, id, hashOutput)
}

export function validateOutput<V>(v: V) {
  return validate<Output & V>(v, id, hashOutput)
}
