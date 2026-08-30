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
const id = 'com.atproto.space.createRecord'

export type QueryParams = {}

export interface InputSchema {
  /** Reference to the space. */
  space: string
  /** The DID of the repo to write to (the authenticated member). */
  repo: string
  /** The NSID of the record collection. */
  collection: string
  /** The Record Key. */
  rkey?: string
  /** Can be set to 'false' to skip Lexicon schema validation of record data, 'true' to require it, or leave unset to validate only for known Lexicons. */
  validate?: boolean
  /** The record itself. Must contain a $type field. */
  record: { [_ in string]: unknown }
}

export interface OutputSchema {
  /** URI of the created record. */
  uri: string
  cid: string
  validationStatus?: 'valid' | 'unknown' | (string & {})
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
  error?: 'SpaceNotFound' | 'RecordAlreadyExists'
}

export type HandlerOutput = HandlerError | HandlerSuccess
