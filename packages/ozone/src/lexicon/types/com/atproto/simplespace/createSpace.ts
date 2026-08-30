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
import type * as ComAtprotoSimplespaceDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.atproto.simplespace.createSpace'

export type QueryParams = {}

export interface InputSchema {
  /** The NSID of the space type, describing the modality of the space (e.g. app.bsky.group, app.bsky.personal). */
  type: string
  /** The space key. Used to differentiate multiple spaces of the same type under the same owner. Same syntax requirements as a record key. If not provided, one will be auto-generated (TID). */
  skey?: string
  policy:
    | $Typed<ComAtprotoSimplespaceDefs.PublicPolicy>
    | $Typed<ComAtprotoSimplespaceDefs.MemberListPolicy>
    | $Typed<ComAtprotoSimplespaceDefs.ManagingAppPolicy>
    | { $type: string }
  appAccess:
    | $Typed<ComAtprotoSimplespaceDefs.Open>
    | $Typed<ComAtprotoSimplespaceDefs.AllowList>
    | { $type: string }
}

export interface OutputSchema {
  /** URI of the created space. */
  uri: string
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
  error?: 'SpaceAlreadyExists' | 'UnsupportedPolicy' | 'UnsupportedAppAccess'
}

export type HandlerOutput = HandlerError | HandlerSuccess
