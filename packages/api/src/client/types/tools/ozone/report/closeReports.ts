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

const is$typed = _is$typed,
  validate = _validate
const id = 'tools.ozone.report.closeReports'

export type QueryParams = {}

export interface InputSchema {
  /** Subject DID (account-level reports) or AT-URI (record-level reports) whose reports should be closed. */
  subject: string
  /** If specified, only reports of the given report types (fully qualified reason NSIDs) are closed. When omitted, all non-closed reports on the subject are targeted. */
  reportTypes?: string[]
  /** Optional moderator-only note recorded on each close activity. Not visible to reporters. */
  internalNote?: string
  /** Set true when this action is triggered by an automated process. Defaults to false. */
  isAutomated?: boolean
}

export interface OutputSchema {
  /** Number of reports that were transitioned to closed. */
  closedCount: number
  /** IDs of the reports that were closed. */
  reportIds: number[]
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

export function toKnownErr(e: any) {
  return e
}
