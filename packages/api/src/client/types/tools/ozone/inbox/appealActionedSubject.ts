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
import type * as ComAtprotoModerationCreateReport from '../../../com/atproto/moderation/createReport.js'
import type * as ToolsOzoneInboxDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'tools.ozone.inbox.appealActionedSubject'

export type QueryParams = {}

export interface InputSchema {
  action?: $Typed<ActionRef> | $Typed<LabelRef> | $Typed<TakedownRef>
  subject:
    | $Typed<ComAtprotoAdminDefs.RepoRef>
    | $Typed<ComAtprotoRepoStrongRef.Main>
    | { $type: string }
  /** Optional explanation supplied by the user. */
  reason?: string
  modTool?: ComAtprotoModerationCreateReport.ModTool
}

export type OutputSchema = ToolsOzoneInboxDefs.SubjectView

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

export class InvalidAppealSubjectError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class AlreadyAppealedError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class NotAppealableError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export class AppealWindowExpiredError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export function toKnownErr(e: any) {
  if (e instanceof XRPCError) {
    if (e.error === 'InvalidAppealSubject')
      return new InvalidAppealSubjectError(e)
    if (e.error === 'AlreadyAppealed') return new AlreadyAppealedError(e)
    if (e.error === 'NotAppealable') return new NotAppealableError(e)
    if (e.error === 'AppealWindowExpired')
      return new AppealWindowExpiredError(e)
  }

  return e
}

export interface ActionRef {
  $type?: 'tools.ozone.inbox.appealActionedSubject#actionRef'
  /** ID of the moderation action being appealed, available via actions in mod inbox. */
  id: number
}

const hashActionRef = 'actionRef'

export function isActionRef<V>(v: V) {
  return is$typed(v, id, hashActionRef)
}

export function validateActionRef<V>(v: V) {
  return validate<ActionRef & V>(v, id, hashActionRef)
}

export interface LabelRef {
  $type?: 'tools.ozone.inbox.appealActionedSubject#labelRef'
  /** Label being appealed. */
  val: string
}

const hashLabelRef = 'labelRef'

export function isLabelRef<V>(v: V) {
  return is$typed(v, id, hashLabelRef)
}

export function validateLabelRef<V>(v: V) {
  return validate<LabelRef & V>(v, id, hashLabelRef)
}

export interface TakedownRef {
  $type?: 'tools.ozone.inbox.appealActionedSubject#takedownRef'
}

const hashTakedownRef = 'takedownRef'

export function isTakedownRef<V>(v: V) {
  return is$typed(v, id, hashTakedownRef)
}

export function validateTakedownRef<V>(v: V) {
  return validate<TakedownRef & V>(v, id, hashTakedownRef)
}
