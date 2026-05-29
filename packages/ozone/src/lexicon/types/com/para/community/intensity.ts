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
const id = 'com.para.community.intensity'

export interface Main {
  $type: 'com.para.community.intensity'
  /** URI of the proposal this intensity declaration applies to */
  proposal: string
  /** DID of the voter making this intensity declaration */
  voter: string
  /** Signal direction, must match the base vote record */
  signal: number
  /** Quadratic voice credits allocated. 1=1², 4=2², 9=3², 16=4². Maps to intensity level 1-4. */
  units: number
  /** Same as units, explicit alias for clarity in audit trails */
  creditsSpent?: number
  /** DIDs whose voting power was aggregated into this intensity record. Empty = direct. */
  delegatedFrom?: string[]
  /** 0 = direct, 1 = one hop. Max 1 in PARA QV-LD. */
  delegationDepth?: number
  /** Computed effective weight after QV sqrt and correlation discounting. Stored for audit trail. */
  effectiveWeight?: string
  /** Privacy-preserving one-person-one-vote nullifier for this proposal intensity declaration, issued by m8. */
  voteNullifier?: string
  /** Opaque reference to the m8 eligibility/nullifier proof used to cast this intensity declaration. */
  eligibilityProofRef?: string
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
