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
import type * as ComParaCommunityListActivities from './listActivities.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.community.getActivity'

export type QueryParams = {
  uri: string
}
export type InputSchema = undefined

export interface OutputSchema {
  activity: ComParaCommunityListActivities.ActivityView
  ledger: LedgerEntryView[]
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

export interface LedgerEntryView {
  $type?: 'com.para.community.getActivity#ledgerEntryView'
  uri: string
  cid: string
  author: string
  /** The com.para.community.activityLedgerEntry record. */
  record: { [_ in string]: unknown }
  indexedAt: string
}

const hashLedgerEntryView = 'ledgerEntryView'

export function isLedgerEntryView<V>(v: V) {
  return is$typed(v, id, hashLedgerEntryView)
}

export function validateLedgerEntryView<V>(v: V) {
  return validate<LedgerEntryView & V>(v, id, hashLedgerEntryView)
}
