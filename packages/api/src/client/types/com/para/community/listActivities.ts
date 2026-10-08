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
const id = 'com.para.community.listActivities'

export type QueryParams = {
  /** Board URI. Omit to list across all communities. */
  community?: string
  category?: 'social' | 'economic' | (string & {})
  /** upcoming: not completed or cancelled, and in progress or not yet ended. past: everything else. */
  time?: 'upcoming' | 'past' | 'any' | (string & {})
  limit?: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  activities: ActivityView[]
  cursor?: string
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

/** An activity published for a community by one of its current organizers (its board's creator, or an owner or moderator by verified authority events). */
export interface ActivityView {
  $type?: 'com.para.community.listActivities#activityView'
  uri: string
  cid: string
  author: string
  category: 'social' | 'economic' | (string & {})
  communityUri: string
  communityName?: string
  /** The com.para.community.socialActivity or economicActivity record. */
  record: { [_ in string]: unknown }
  indexedAt: string
}

const hashActivityView = 'activityView'

export function isActivityView<V>(v: V) {
  return is$typed(v, id, hashActivityView)
}

export function validateActivityView<V>(v: V) {
  return validate<ActivityView & V>(v, id, hashActivityView)
}
