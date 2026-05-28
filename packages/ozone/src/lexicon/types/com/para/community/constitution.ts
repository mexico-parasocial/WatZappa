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
const id = 'com.para.community.constitution'

export interface Main {
  $type: 'com.para.community.constitution'
  community: string
  /** Constitution version, incremented on each amendment */
  version: number
  rules: Rules
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

export interface Rules {
  $type?: 'com.para.community.constitution#rules'
  /** Fraction of members required for quorum (0.0 - 1.0) */
  quorum?: string
  /** Fraction of votes required to approve (0.0 - 1.0) */
  approvalThreshold?: string
  /** Minimum days of deliberation before voting */
  deliberationDays?: number
  /** Days voting remains open */
  votingDays?: number
  /** Max members per chamber */
  chamberSize?: number
  /** Max observer council size */
  observerSize?: number
  autoModeration?: AutoModeration
  budget?: Budget
}

const hashRules = 'rules'

export function isRules<V>(v: V) {
  return is$typed(v, id, hashRules)
}

export function validateRules<V>(v: V) {
  return validate<Rules & V>(v, id, hashRules)
}

export interface AutoModeration {
  $type?: 'com.para.community.constitution#autoModeration'
  enabled?: boolean
  /** Max identical messages per hour */
  spamThreshold?: number
  /** ML toxicity score threshold (0.0 - 1.0) */
  toxicityThreshold?: string
}

const hashAutoModeration = 'autoModeration'

export function isAutoModeration<V>(v: V) {
  return is$typed(v, id, hashAutoModeration)
}

export function validateAutoModeration<V>(v: V) {
  return validate<AutoModeration & V>(v, id, hashAutoModeration)
}

export interface Budget {
  $type?: 'com.para.community.constitution#budget'
  enabled?: boolean
  /** Total matching funds available */
  matchingPool?: string
  /** Minimum individual contribution */
  minContribution?: string
  /** Duration of each quadratic funding round */
  roundDurationDays?: number
}

const hashBudget = 'budget'

export function isBudget<V>(v: V) {
  return is$typed(v, id, hashBudget)
}

export function validateBudget<V>(v: V) {
  return validate<Budget & V>(v, id, hashBudget)
}
