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
const id = 'com.para.community.createBoard'

export type QueryParams = {}

export interface InputSchema {
  name: string
  quadrant: string
  description?: string
  /** User-provided name for the internal starter pack tracking founding members. If absent, a default name will be generated. */
  founderStarterPackName?: string
  /** Governance model for this community. Hierarchical uses owner/moderator roles. Horizontal uses rotating facilitators and assembly votes. Defaults to hierarchical. */
  governanceMode?: 'hierarchical' | 'horizontal' | (string & {})
}

export interface OutputSchema {
  uri: string
  cid: string
  delegatesChatId: string
  subdelegatesChatId: string
  /** Reference to the newly created founder starter pack. Present if status is draft. */
  founderStarterPackUri?: string
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
}

export type HandlerOutput = HandlerError | HandlerSuccess
