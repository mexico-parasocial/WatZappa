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
const id = 'com.para.community.deliberationVote'

export interface Main {
  $type: 'com.para.community.deliberationVote'
  /** The argument being weighed. */
  deliberation: string
  voter: string
  /** Which way the voter leans on this argument. `pass` records having read it without taking a side. */
  direction: 'agree' | 'disagree' | 'pass' | (string & {})
  /** One-person-one-argument nullifier issued by m8. INTEGRITY ONLY, NOT ANONYMITY: m8 derives this value server-side from a stable person identifier and stores it beside that identifier. This record is attributable to its author anyway, by design. See OD-7 §5a. */
  voteNullifier?: string
  /** Opaque reference to the m8 eligibility/nullifier proof used. */
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
