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
const id = 'com.para.civic.vote'

export interface Main {
  $type: 'com.para.civic.vote'
  /** The proposal, policy, matter, or cabildeo record being voted on. */
  subject?: string
  /** Optional semantic type for clients and indexers. */
  subjectType?: 'cabildeo' | 'policy' | 'matter' | 'governance' | (string & {})
  cabildeo?: string
  selectedOption?: number
  /** Weighted consensus signal for policy-style votes: -3 strong opposition, 0 neutral/abstain, +3 strong support. */
  signal?: number
  /** Optional voter rationale for the signal. */
  reason?: string
  isDirect: boolean
  delegatedFrom?: string[]
  /** Privacy-preserving one-person-one-vote nullifier for this subject, issued by m8. */
  voteNullifier?: string
  /** Opaque reference to the m8 eligibility/nullifier proof used to cast this vote. */
  eligibilityProofRef?: string
  createdAt: string
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
