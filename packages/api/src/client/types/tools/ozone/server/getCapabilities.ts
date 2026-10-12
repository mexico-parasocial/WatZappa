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
const id = 'tools.ozone.server.getCapabilities'

export type QueryParams = {}
export type InputSchema = undefined

export interface OutputSchema {
  notifications?: NotificationConfig
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

export interface NotificationConfig {
  $type?: 'tools.ozone.server.getCapabilities#notificationConfig'
  channels: ('inApp' | 'push' | (string & {}))[]
}

const hashNotificationConfig = 'notificationConfig'

export function isNotificationConfig<V>(v: V) {
  return is$typed(v, id, hashNotificationConfig)
}

export function validateNotificationConfig<V>(v: V) {
  return validate<NotificationConfig & V>(v, id, hashNotificationConfig)
}
