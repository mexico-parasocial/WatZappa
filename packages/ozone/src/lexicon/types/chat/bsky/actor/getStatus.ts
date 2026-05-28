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
const id = 'chat.bsky.actor.getStatus'

export type QueryParams = {}
export type InputSchema = undefined

export interface OutputSchema {
  /** True when the viewer's account is disabled and cannot actively participate in chat. */
  chatDisabled: boolean
  /** Whether the viewer's account is allowed to create group chats. New accounts are restricted from creating groups. */
  canCreateGroups: boolean
  /** The maximum number of members allowed in a group conversation. */
  groupMemberLimit: number
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
