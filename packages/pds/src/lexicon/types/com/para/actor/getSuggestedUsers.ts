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
import type * as AppBskyActorDefs from '../../../app/bsky/actor/defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.actor.getSuggestedUsers'

export type QueryParams = {
  /** Civic pillar to bias the suggestions toward. Authors who have recently posted under this pillar's sub-tags will rank higher. */
  category?:
    | 'public-services'
    | 'internal-revenue'
    | 'economy'
    | 'social-issues'
    | 'external-affairs'
    | 'internal-affairs'
    | (string & {})
  /** Optional list of sub-tag interest keys (e.g. 'healthcare', 'minimum-wage'). When provided, authors with matching post tags are boosted. */
  interests?: string[]
  limit: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  actors: AppBskyActorDefs.ProfileView[]
  recId?: string
  cursor?: string
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
