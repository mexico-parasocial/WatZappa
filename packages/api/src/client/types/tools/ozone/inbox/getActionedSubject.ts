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
import type * as ToolsOzoneInboxDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'tools.ozone.inbox.getActionedSubject'

export type QueryParams = {
  /** Account to preview. Defaults to the authenticated account; another account requires an active moderator, triage, or admin credential. */
  did?: string
  /** DID or AT-URI of the subject to retrieve. */
  subject: string
  /** Maximum number of actions to return. */
  limit?: number
  /** Opaque cursor for the next page of this subject's action history. */
  cursor?: string
}
export type InputSchema = undefined
export type OutputSchema = ToolsOzoneInboxDefs.SubjectViewDetail

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
