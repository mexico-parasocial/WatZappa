// @ts-nocheck
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
  /** One-person-one-vote nullifier for this subject, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a. */
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
