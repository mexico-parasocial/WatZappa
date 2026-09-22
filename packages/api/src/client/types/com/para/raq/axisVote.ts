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
const id = 'com.para.raq.axisVote'

export interface Main {
  $type: 'com.para.raq.axisVote'
  /** Reference to the community axis being voted on */
  axisId: string
  /** Vote direction: -1 oppose, 0 neutral, 1 support */
  value?: number
  /** One-person-one-vote nullifier for this RAQ axis, issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier, so the server can reconstruct which subjects a person voted on. This record is also written to the voter's own public repo and signed by their DID, so the ballot is attributable to the voter regardless of this field. See OD-7 §5a. */
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
