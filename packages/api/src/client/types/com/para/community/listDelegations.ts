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
import type * as ComParaCommunityDelegation from './delegation.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.community.listDelegations'

export type QueryParams = {
  delegator?: string
  delegate?: string
  community?: string
  limit?: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  delegations: DelegationView[]
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

export interface DelegationView {
  $type?: 'com.para.community.listDelegations#delegationView'
  uri: string
  cid: string
  delegate: string
  delegator: string
  delegateRole?: string
  party?: string
  scope: ComParaCommunityDelegation.DelegationScope
  expiresAt?: string
  revokedAt?: string
  createdAt: string
}

const hashDelegationView = 'delegationView'

export function isDelegationView<V>(v: V) {
  return is$typed(v, id, hashDelegationView)
}

export function validateDelegationView<V>(v: V) {
  return validate<DelegationView & V>(v, id, hashDelegationView)
}
