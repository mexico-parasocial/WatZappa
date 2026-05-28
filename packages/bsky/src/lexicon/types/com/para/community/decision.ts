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
const id = 'com.para.community.decision'

export interface Main {
  $type: 'com.para.community.decision'
  proposal: string
  community: string
  result: 'approved' | 'rejected' | 'tied' | 'quorum_not_met'
  votesFor: number
  votesAgainst: number
  votesAbstain: number
  /** Total eligible voters at time of decision */
  totalMembers?: number
  quorumRequired?: string
  thresholdRequired?: string
  constitutionVersion?: number
  /** If budget proposal, amount approved */
  budgetAllocated?: string
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
