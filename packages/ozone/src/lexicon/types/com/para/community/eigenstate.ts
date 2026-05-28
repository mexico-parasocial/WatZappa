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
const id = 'com.para.community.eigenstate'

export interface Main {
  $type: 'com.para.community.eigenstate'
  community: string
  computedAt: string
  eigenvalues: EigenvalueEntry[]
  correlationMatrix: CorrelationEntry[]
  /** Time-to-live for this snapshot before recomputation */
  ttlSeconds: number
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

export interface EigenvalueEntry {
  $type?: 'com.para.community.eigenstate#eigenvalueEntry'
  /** Identifier for this eigencomponent (e.g., 'party_a', 'delegate_pedro') */
  component: string
  /** Eigenvalue magnitude, fixed-point scaled by 10000 (e.g. 8675 = 0.8675) */
  value: number
  /** DIDs that load heavily on this component */
  dids: string[]
}

const hashEigenvalueEntry = 'eigenvalueEntry'

export function isEigenvalueEntry<V>(v: V) {
  return is$typed(v, id, hashEigenvalueEntry)
}

export function validateEigenvalueEntry<V>(v: V) {
  return validate<EigenvalueEntry & V>(v, id, hashEigenvalueEntry)
}

export interface CorrelationEntry {
  $type?: 'com.para.community.eigenstate#correlationEntry'
  didA: string
  didB: string
  /** Correlation coefficient between these two voters, fixed-point scaled by 10000 (e.g. 8675 = 0.8675) */
  correlation: number
  /** Why they are correlated: party, delegation, civic_stamps, etc. */
  sources?: string[]
}

const hashCorrelationEntry = 'correlationEntry'

export function isCorrelationEntry<V>(v: V) {
  return is$typed(v, id, hashCorrelationEntry)
}

export function validateCorrelationEntry<V>(v: V) {
  return validate<CorrelationEntry & V>(v, id, hashCorrelationEntry)
}
