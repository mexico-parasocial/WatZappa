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
const id = 'com.para.community.getTallySimulation'

export type QueryParams = {
  proposal: string
}
export type InputSchema = undefined

export interface OutputSchema {
  flat: TallyResult
  sqrtN: TallyResult
  correlation: TallyResult
  metrics: ConcentrationMetrics
}

export type HandlerInput = void

export interface HandlerSuccess {
  encoding: 'application/json'
  body: OutputSchema
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
}

export type HandlerOutput = HandlerError | HandlerSuccess

export interface TallyResult {
  $type?: 'com.para.community.getTallySimulation#tallyResult'
  voteCount: number
  signalSum: string
  signalAverage: string
  effectiveWeightSum?: string
  quorumMet: boolean
  quorumTarget?: number
  breakdown?: BreakdownBucket[]
}

const hashTallyResult = 'tallyResult'

export function isTallyResult<V>(v: V) {
  return is$typed(v, id, hashTallyResult)
}

export function validateTallyResult<V>(v: V) {
  return validate<TallyResult & V>(v, id, hashTallyResult)
}

export interface BreakdownBucket {
  $type?: 'com.para.community.getTallySimulation#breakdownBucket'
  signal: number
  count: number
}

const hashBreakdownBucket = 'breakdownBucket'

export function isBreakdownBucket<V>(v: V) {
  return is$typed(v, id, hashBreakdownBucket)
}

export function validateBreakdownBucket<V>(v: V) {
  return validate<BreakdownBucket & V>(v, id, hashBreakdownBucket)
}

export interface ConcentrationMetrics {
  $type?: 'com.para.community.getTallySimulation#concentrationMetrics'
  /** Max effective weight / total effective weight (post-√n). 0 = equal, 1 = all power in one block. */
  maxWeightRatio: string
  /** 1 / HHI over effective weights. Approximate number of equally-weighted voters. */
  effectiveParticipants: string
  /** Percentage of delegations that were revoked. */
  revocationRate: string
  /** Percentage of votes cast directly (not delegated) */
  directVotePct: string
  /** Whether these tallies are advisory only */
  shadowMode: boolean
}

const hashConcentrationMetrics = 'concentrationMetrics'

export function isConcentrationMetrics<V>(v: V) {
  return is$typed(v, id, hashConcentrationMetrics)
}

export function validateConcentrationMetrics<V>(v: V) {
  return validate<ConcentrationMetrics & V>(v, id, hashConcentrationMetrics)
}
