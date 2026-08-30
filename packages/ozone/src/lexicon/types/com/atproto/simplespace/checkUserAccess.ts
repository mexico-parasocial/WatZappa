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
const id = 'com.atproto.simplespace.checkUserAccess'

export type QueryParams = {
  /** Reference to the space. */
  space: string
  /** The DID of the requesting user. */
  user: string
  /** The attested client_id, if a client attestation was presented. */
  clientId?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  /** Whether the managing app authorizes the request. */
  authorized: boolean
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
