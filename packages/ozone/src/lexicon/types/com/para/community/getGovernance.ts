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
import type * as ComParaCommunityDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.community.getGovernance'

export type QueryParams = {
  /** Community identifier or label (for example: mx-federal or p/mx-federal). */
  community: string
  /** Optional stable identifier for the community. */
  communityId?: string
  /** Maximum number of candidate members considered for role assignment. */
  limit: number
}
export type InputSchema = undefined

export interface OutputSchema {
  source: 'network' | 'repo' | 'mock' | (string & {})
  community: string
  communityId?: string
  slug: string
  createdAt: string
  updatedAt: string
  moderators: ComParaCommunityDefs.ModeratorView[]
  officials: ComParaCommunityDefs.OfficialView[]
  deputies: ComParaCommunityDefs.DeputyRoleView[]
  metadata?: ComParaCommunityDefs.Metadata
  editHistory: ComParaCommunityDefs.HistoryEntry[]
  counters: ComParaCommunityDefs.Summary
  summary: ComParaCommunityDefs.Summary
  computedAt: string
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
