// @ts-nocheck
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
const id = 'com.atproto.space.listRecords'

export type QueryParams = {
  /** Reference to the space. */
  space: string
  /** The DID of the account whose repo to list. */
  repo: string
  /** The NSID of the record collection. If omitted, lists records across all collections. */
  collection?: string
  /** The number of records to return. */
  limit: number
  cursor?: string
  /** Flag to reverse the order of the returned records. */
  reverse?: boolean
  /** If true, omit inlined record values and return only metadata (collection, rkey, cid). */
  excludeValues: boolean
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  records: Record[]
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
  error?:
    | 'SpaceNotFound'
    | 'RepoNotFound'
    | 'RepoTakendown'
    | 'RepoSuspended'
    | 'RepoDeactivated'
}

export type HandlerOutput = HandlerError | HandlerSuccess

export interface Record {
  $type?: 'com.atproto.space.listRecords#record'
  collection: string
  rkey: string
  cid: string
  /** The record's value. Inlined by default; omitted when excludeValues is set. */
  value?: { [_ in string]: unknown }
}

const hashRecord = 'record'

export function isRecord<V>(v: V) {
  return is$typed(v, id, hashRecord)
}

export function validateRecord<V>(v: V) {
  return validate<Record & V>(v, id, hashRecord)
}
