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
const id = 'com.atproto.space.getSpaceCredential'

export type QueryParams = {}

export interface InputSchema {
  /** Reference to the space. */
  space: string
  /** Optional client attestation JWT establishing the app's identity. Required only when the space gates on app identity. */
  clientAttestation?: string
}

export interface OutputSchema {
  /** A signed JWT space credential, bound through its cnf.jkt claim to the key that signed the request's DPoP proof. */
  credential: string
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
  error?:
    | 'SpaceNotFound'
    | 'SpaceDeleted'
    | 'UserNotAuthorized'
    | 'AppNotAuthorized'
    | 'NotAuthorized'
    | 'InvalidDelegationToken'
    | 'InvalidClientAttestation'
}

export type HandlerOutput = HandlerError | HandlerSuccess
