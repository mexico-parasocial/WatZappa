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
  /** DEPRECATED 2026-09-22 (OD-7 §5h): this collection is a public reaction and its count decides nothing, so no m8 nullifier is requested. The PDS refuses any write of this record that carries this field; do not set it. When reactions did request one, issuance made m8 derive the value server-side from a stable person identifier and store a durable (person, subject) row beside it. */
  voteNullifier?: string
  /** DEPRECATED 2026-09-22 (OD-7 §5h): this reaction carries no m8 proof. The PDS refuses any write of this record that carries this field; do not set it. */
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
