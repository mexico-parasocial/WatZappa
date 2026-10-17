// @ts-nocheck
/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { HeadersMap, XRPCError } from '@atproto/xrpc'
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util.js'
import type * as ComAtprotoAdminDefs from '../../../com/atproto/admin/defs.js'
import type * as ComAtprotoRepoStrongRef from '../../../com/atproto/repo/strongRef.js'
import type * as ChatBskyConvoDefs from '../../../chat/bsky/convo/defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'tools.ozone.inbox.listReports'

export type QueryParams = {
  /** Account to preview. Defaults to the authenticated account; another account requires an active moderator, triage, or admin credential. */
  did?: string
  /** Filter report activity. unread includes reports whose updatedAt is after the reports section's seenAt watermark. */
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
  reports: ReportView[]
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

export interface ReportView {
  $type?: 'tools.ozone.inbox.listReports#reportView'
  /** DID of the moderation service that received the report. */
  src: string
  /** Report ID (report table ID), used by getReport and Ozone's report detail page. */
  id: number
  isRead: boolean
  /** The exact fully-qualified reason NSID submitted with and stored on the report. */
  reasonType: string
  reason?: string
  /** Public action associated with this report's transition to resolved. See the public action vocabulary table. */
  lastActionTaken?: string
  scope?: 'network' | 'app' | 'labelOnly' | (string & {})
  subject:
    | $Typed<ComAtprotoAdminDefs.RepoRef>
    | $Typed<ComAtprotoRepoStrongRef.Main>
    | $Typed<ChatBskyConvoDefs.MessageRef>
    | $Typed<ChatBskyConvoDefs.ConvoRef>
    | { $type: string }
  status: 'pending' | 'resolved' | (string & {})
  createdAt: string
  updatedAt: string
}

const hashReportView = 'reportView'

export function isReportView<V>(v: V) {
  return is$typed(v, id, hashReportView)
}

export function validateReportView<V>(v: V) {
  return validate<ReportView & V>(v, id, hashReportView)
}
