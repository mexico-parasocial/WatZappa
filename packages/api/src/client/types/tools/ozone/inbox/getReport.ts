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
const id = 'tools.ozone.inbox.getReport'

export type QueryParams = {
  /** Reporter to preview. Defaults to the authenticated account; another account requires an active moderator, triage, or admin credential. */
  did?: string
  /** Report ID (report table ID), as returned by listReports. */
  id: number
}
export type InputSchema = undefined

export interface OutputSchema {
  report: ReportView
  resolution?: ResolutionView
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

export class NotFoundError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export function toKnownErr(e: any) {
  if (e instanceof XRPCError) {
    if (e.error === 'NotFound') return new NotFoundError(e)
  }

  return e
}

export interface ReportView {
  $type?: 'tools.ozone.inbox.getReport#reportView'
  /** DID of the moderation service that received the report. */
  src: string
  /** Report ID (report table ID), used by Ozone's report detail page. */
  id: number
  /** The exact fully-qualified reason NSID submitted with and stored on the report. */
  reasonType: string
  reason?: string
  subject:
    | $Typed<ComAtprotoAdminDefs.RepoRef>
    | $Typed<ComAtprotoRepoStrongRef.Main>
    | $Typed<ChatBskyConvoDefs.MessageRef>
    | $Typed<ChatBskyConvoDefs.ConvoRef>
    | { $type: string }
  /** Raw record JSON for the subject, when the subject is a record and the record is available. */
  record?: { [_ in string]: unknown }
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

export interface ResolutionView {
  $type?: 'tools.ozone.inbox.getReport#resolutionView'
  outcome: 'actionTaken' | 'noAction' | 'other' | (string & {})
  /** Public action associated with this report's resolution. See the public action vocabulary table. */
  actionTaken?: string
  scope?: 'network' | 'app' | 'labelOnly' | (string & {})
  resolvedAt: string
}

const hashResolutionView = 'resolutionView'

export function isResolutionView<V>(v: V) {
  return is$typed(v, id, hashResolutionView)
}

export function validateResolutionView<V>(v: V) {
  return validate<ResolutionView & V>(v, id, hashResolutionView)
}
