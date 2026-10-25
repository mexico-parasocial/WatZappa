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
import type * as ToolsOzoneInboxDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'tools.ozone.inbox.listActionedSubjects'

export type QueryParams = {
  /** Account to preview. Defaults to the authenticated account; another account requires an active moderator, triage, or admin credential. */
  did?: string
  /** Filter subject activity. pending includes subjects whose latest appeal report is not closed; resolved includes subjects whose latest appeal report is closed. unread includes subjects whose public updatedAt is after the subjects section's seenAt watermark. */
  filter?: 'all' | 'pending' | 'resolved' | 'unread'
  sortField?: 'createdAt' | 'updatedAt'
  sortDirection?: 'asc' | 'desc'
  limit?: number
  /** An opaque cursor for pagination. */
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  subjects: ToolsOzoneInboxDefs.SubjectView[]
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export function toKnownErr(e: any) {
  return e
}
