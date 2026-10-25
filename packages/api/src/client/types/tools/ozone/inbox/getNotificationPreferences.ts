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
const id = 'tools.ozone.inbox.getNotificationPreferences'

export type QueryParams = {
  /** Account to preview. Only Ozone staff can read another account; this does not change its read state. */
  did?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  preferences: ToolsOzoneInboxDefs.NotificationPreferences
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
