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
import type * as ComParaRaqDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.raq.assessment'

export interface Main {
  $type: 'com.para.raq.assessment'
  /** Individual question answers keyed by question id */
  answers: Answer[]
  /** Per-axis normalized scores */
  results: ComParaRaqDefs.AxisResult[]
  compass: ComParaRaqDefs.CompassPosition
  ideology: ComParaRaqDefs.IdeologyMatch
  secondaryIdeology?: ComParaRaqDefs.IdeologyMatch
  /** Political party alignment percentages */
  partyMatches?: ComParaRaqDefs.PartyMatch[]
  /** Whether this assessment is visible on the user's profile */
  isPublic: boolean
  completedAt: string
  /** Schema version of the RAQ questionnaire */
  version?: string
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

export interface Answer {
  $type?: 'com.para.raq.assessment#answer'
  questionId: string
  value: number
}

const hashAnswer = 'answer'

export function isAnswer<V>(v: V) {
  return is$typed(v, id, hashAnswer)
}

export function validateAnswer<V>(v: V) {
  return validate<Answer & V>(v, id, hashAnswer)
}
