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
import type * as ComParaCommunityDefs from '../community/defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.actor.exportCivicTree'

export type QueryParams = {
  /** DID of the actor to export. Defaults to the authenticated viewer. */
  actor?: string
  /** Include the actor's cast votes. Defaults to true. */
  includeVotes?: boolean
  /** Include the actor's liquid-democracy delegations. Defaults to true. */
  includeDelegations?: boolean
  /** Include the actor's public compass highlights. Defaults to true. */
  includeHighlights?: boolean
  /** Include communities the actor is a member of. Defaults to true. */
  includeCommunities?: boolean
}
export type InputSchema = undefined

export interface OutputSchema {
  generatedAt: string
  files: ComParaCommunityDefs.ObsidianFileView[]
  summary?: Summary
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

export interface Summary {
  $type?: 'com.para.actor.exportCivicTree#summary'
  communityCount: number
  cabildeoCount: number
  voteCount: number
  delegationCount: number
  highlightCount: number
}

const hashSummary = 'summary'

export function isSummary<V>(v: V) {
  return is$typed(v, id, hashSummary)
}

export function validateSummary<V>(v: V) {
  return validate<Summary & V>(v, id, hashSummary)
}
