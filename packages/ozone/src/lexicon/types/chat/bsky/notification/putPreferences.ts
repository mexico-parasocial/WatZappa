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
import type * as ChatBskyNotificationDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'chat.bsky.notification.putPreferences'

export type QueryParams = {}

export interface InputSchema {
  chat?: ChatBskyNotificationDefs.ChatPreference
  chatRequest?: ChatBskyNotificationDefs.ChatPreference
}

export interface OutputSchema {
  preferences: ChatBskyNotificationDefs.Preferences
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
