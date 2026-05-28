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
const id = 'com.para.community.listMembers'

export type QueryParams = {
  communityId: string
  membershipState?:
    | 'pending'
    | 'active'
    | 'left'
    | 'removed'
    | 'blocked'
    | (string & {})
  role?: string
  sort?: 'joined' | 'participation' | (string & {})
  limit?: number
  cursor?: string
}
export type InputSchema = undefined
export type OutputSchema = Output

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

export interface MemberView {
  $type?: 'com.para.community.listMembers#memberView'
  did: string
  handle?: string
  displayName?: string
  avatar?: string
  membershipState:
    | 'pending'
    | 'active'
    | 'left'
    | 'removed'
    | 'blocked'
    | (string & {})
  roles: string[]
  joinedAt: string
  votesCast: number
  delegationsReceived: number
  policyPosts: number
  matterPosts: number
}

const hashMemberView = 'memberView'

export function isMemberView<V>(v: V) {
  return is$typed(v, id, hashMemberView)
}

export function validateMemberView<V>(v: V) {
  return validate<MemberView & V>(v, id, hashMemberView)
}

export interface Output {
  $type?: 'com.para.community.listMembers#output'
  members: MemberView[]
  cursor?: string
}

const hashOutput = 'output'

export function isOutput<V>(v: V) {
  return is$typed(v, id, hashOutput)
}

export function validateOutput<V>(v: V) {
  return validate<Output & V>(v, id, hashOutput)
}
