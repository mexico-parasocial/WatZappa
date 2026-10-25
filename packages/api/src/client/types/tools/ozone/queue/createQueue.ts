// @ts-nocheck
/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type HeadersMap, XRPCError } from '@atproto/xrpc'
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util.js'
import type * as ToolsOzoneQueueDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'tools.ozone.queue.createQueue'

export type QueryParams = {}

export interface InputSchema {
  /** Display name for the queue (must be unique) */
  name: string
  /** Subject types this queue accepts */
  subjectTypes?: (
    'account' | 'record' | 'message' | 'conversation' | (string & {})
  )[]
  /** Collection name for record subjects. Omit to accept every collection. */
  collection?: string
  /** Report reason types (fully qualified NSIDs) */
  reportTypes?: string[]
  /** Match any listed tag on the account submitting the report. */
  reporterTags?: string[]
  /** Match any of these tags on the account that is being reported against. */
  accountTags?: string[]
  /** Optional description of the queue */
  description?: string
  /** Policy keys to recommend when actioning reports in this queue */
  recommendedPolicies?: string[]
  /** Labels to recommend for this queue and use as fallback appeal routing mappings */
  recommendedLabels?: string[]
  /** Admins can always list this queue and browse its reports. Other roles require an active queue assignment. Individual report and moderation event access is unchanged. */
  strictAccess?: boolean
}

export interface OutputSchema {
  queue: ToolsOzoneQueueDefs.QueueView
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
  qp?: QueryParams
  encoding?: 'application/json'
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export class InvalidRecommendedPoliciesError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class ConflictingQueueError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export function toKnownErr(e: any) {
  if (e instanceof XRPCError) {
    if (e.error === 'InvalidRecommendedPolicies')
      return new InvalidRecommendedPoliciesError(e)
    if (e.error === 'ConflictingQueue') return new ConflictingQueueError(e)
  }

  return e
}
