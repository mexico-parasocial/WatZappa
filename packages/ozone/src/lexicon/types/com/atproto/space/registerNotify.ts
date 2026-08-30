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
const id = 'com.atproto.space.registerNotify'

export type QueryParams = {}

export interface InputSchema {
  /** Reference to the space. */
  space: string
  /** Service identifier of the subscriber: a DID with an optional service fragment naming the entry in its DID document to deliver to (e.g. 'did:web:syncer.example.com#atproto_space_syncer'). notifyWrite calls are addressed to this identifier. */
  service: string
}

export interface OutputSchema {
  /** When the registration expires. May be later than the expiry of the space credential the request was authenticated with; renew before this time to stay subscribed. */
  expiresAt: string
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
  error?: 'SpaceNotFound' | 'ServiceNotResolvable'
}

export type HandlerOutput = HandlerError | HandlerSuccess
