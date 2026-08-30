// @ts-nocheck
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
const id = 'com.para.community.listDeliberations'

export type QueryParams = {
  proposal: string
  limit?: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  statements?: DeliberationStatement[]
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

export interface DeliberationStatement {
  $type?: 'com.para.community.listDeliberations#deliberationStatement'
  uri: string
  cid: string
  creator: string
  proposal: string
  body: string
  stance: string
  agreeCount: number
  disagreeCount: number
  passCount: number
  createdAt: string
}

const hashDeliberationStatement = 'deliberationStatement'

export function isDeliberationStatement<V>(v: V) {
  return is$typed(v, id, hashDeliberationStatement)
}

export function validateDeliberationStatement<V>(v: V) {
  return validate<DeliberationStatement & V>(v, id, hashDeliberationStatement)
}
