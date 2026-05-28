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
import type * as ComParaActorDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.actor.getProfileStats'

export type QueryParams = {
  /** Handle or DID of the actor. */
  actor: string
}
export type InputSchema = undefined

export interface OutputSchema {
  actor: string
  stats: ComParaActorDefs.ProfileStats
  status?: ComParaActorDefs.StatusView
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
  error?: 'NotFound' | 'BlockedActor' | 'BlockedByActor'
}

export type HandlerOutput = HandlerError | HandlerSuccess
