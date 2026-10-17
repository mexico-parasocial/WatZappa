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
const id = 'tools.ozone.inbox.getAccountStatus'

export type QueryParams = {
  /** Account to preview. Only Ozone staff can read another account; this does not change its read state. */
  did?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  /** DID of the moderation service returning this status. */
  src: string
  standing: 'good' | 'warning' | 'atRisk' | (string & {})
  /** Newest account-status update or strike timestamp used to derive this standing, or the Unix epoch when neither exists. This is not a standing-transition timestamp; expiry can change standing without changing this value. */
  updatedAt: string
  /** Time at which the current suspension expires. Present only for a temporary suspension. */
  expiresAt?: string
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
