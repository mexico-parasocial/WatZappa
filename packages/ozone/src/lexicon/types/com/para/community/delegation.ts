/**
 * GENERATED CODE - DO NOT MODIFY
 */
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
const id = 'com.para.community.delegation'

export interface Main {
  $type: 'com.para.community.delegation'
  /** Who receives the delegated voting power */
  delegate: string
  /** Who is lending their voice */
  delegator: string
  /** Role under which the delegate receives power: representative, moderator, official, board_member, etc. */
  delegateRole?: string
  /** Party or flair context for this delegation */
  party?: string
  scope: DelegationScope
  /** Auto-expiration. If absent, delegation expires in 90 days by default. */
  expiresAt?: string
  /** When the delegator explicitly revoked this delegation */
  revokedAt?: string
  createdAt?: string
  [k: string]: unknown
}

const hashMain = 'main'

export function isMain<V>(v: V) {
  return is$typed(v, id, hashMain)
}

export function validateMain<V>(v: V) {
  return validate<Main & V>(v, id, hashMain, true)
}

export {
  type Main as Record,
  isMain as isRecord,
  validateMain as validateRecord,
}

export interface DelegationScope {
  $type?: 'com.para.community.delegation#delegationScope'
  mode: 'community' | 'topic' | 'proposal' | 'topicCommunity'
  /** Required for community, topicCommunity modes */
  community?: string
  /** Required for topic, topicCommunity modes */
  topic?: 'general' | 'budget' | 'amendment' | 'moderation'
  /** Required for proposal mode */
  proposal?: string
}

const hashDelegationScope = 'delegationScope'

export function isDelegationScope<V>(v: V) {
  return is$typed(v, id, hashDelegationScope)
}

export function validateDelegationScope<V>(v: V) {
  return validate<DelegationScope & V>(v, id, hashDelegationScope)
}
