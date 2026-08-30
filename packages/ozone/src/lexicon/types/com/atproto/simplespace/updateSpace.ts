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
const id = 'com.atproto.simplespace.updateSpace'

export type QueryParams = {}

export interface InputSchema {
  /** Reference to the space to update. */
  space: string
  policy?:
    | $Typed<ComAtprotoSimplespaceDefs.PublicPolicy>
    | $Typed<ComAtprotoSimplespaceDefs.MemberListPolicy>
    | $Typed<ComAtprotoSimplespaceDefs.ManagingAppPolicy>
    | { $type: string }
  appAccess?:
    | $Typed<ComAtprotoSimplespaceDefs.Open>
    | $Typed<ComAtprotoSimplespaceDefs.AllowList>
    | { $type: string }
}

export interface HandlerInput {
  encoding: 'application/json'
  body: InputSchema
}

export interface HandlerError {
  status: number
  message?: string
  error?:
    | 'SpaceNotFound'
    | 'NotSpaceOwner'
    | 'UnsupportedPolicy'
    | 'UnsupportedAppAccess'
}

export type HandlerOutput = HandlerError | void
