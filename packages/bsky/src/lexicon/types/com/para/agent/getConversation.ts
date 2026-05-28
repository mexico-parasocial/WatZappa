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
import type * as ComParaAgentDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.agent.getConversation'

export type QueryParams = {
  /** Identifier of the agent whose conversation to retrieve. */
  agentId: string
}
export type InputSchema = undefined

export interface OutputSchema {
  /** Ordered list of messages in the conversation. */
  messages: ComParaAgentDefs.MessageView[]
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
