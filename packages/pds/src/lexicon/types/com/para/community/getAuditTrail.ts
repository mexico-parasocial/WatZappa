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
const id = 'com.para.community.getAuditTrail'

export type QueryParams = {
  proposal: string
}
export type InputSchema = undefined

export interface OutputSchema {
  proposal: string
  votes: VoteEntry[]
  intensities: IntensityEntry[]
  delegations: DelegationEntry[]
  tallies: TallyBreakdown
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

export interface VoteEntry {
  $type?: 'com.para.community.getAuditTrail#voteEntry'
  voter: string
  signal: number
  createdAt: string
}

const hashVoteEntry = 'voteEntry'

export function isVoteEntry<V>(v: V) {
  return is$typed(v, id, hashVoteEntry)
}

export function validateVoteEntry<V>(v: V) {
  return validate<VoteEntry & V>(v, id, hashVoteEntry)
}

export interface IntensityEntry {
  $type?: 'com.para.community.getAuditTrail#intensityEntry'
  voter: string
  signal: number
  units: number
  creditsSpent: number
  delegatedFrom?: string[]
  delegationDepth?: number
  effectiveWeight?: string
  createdAt: string
}

const hashIntensityEntry = 'intensityEntry'

export function isIntensityEntry<V>(v: V) {
  return is$typed(v, id, hashIntensityEntry)
}

export function validateIntensityEntry<V>(v: V) {
  return validate<IntensityEntry & V>(v, id, hashIntensityEntry)
}

export interface DelegationEntry {
  $type?: 'com.para.community.getAuditTrail#delegationEntry'
  delegate: string
  delegator: string
  delegateRole?: string
  scopeMode: string
  scopeCommunity?: string
  scopeProposal?: string
  createdAt: string
}

const hashDelegationEntry = 'delegationEntry'

export function isDelegationEntry<V>(v: V) {
  return is$typed(v, id, hashDelegationEntry)
}

export function validateDelegationEntry<V>(v: V) {
  return validate<DelegationEntry & V>(v, id, hashDelegationEntry)
}

export interface TallyBreakdown {
  $type?: 'com.para.community.getAuditTrail#tallyBreakdown'
  flat: TallySteps
  sqrtN: TallySteps
  correlation: TallySteps
}

const hashTallyBreakdown = 'tallyBreakdown'

export function isTallyBreakdown<V>(v: V) {
  return is$typed(v, id, hashTallyBreakdown)
}

export function validateTallyBreakdown<V>(v: V) {
  return validate<TallyBreakdown & V>(v, id, hashTallyBreakdown)
}

export interface TallySteps {
  $type?: 'com.para.community.getAuditTrail#tallySteps'
  steps: Step[]
  result: TallyResult
}

const hashTallySteps = 'tallySteps'

export function isTallySteps<V>(v: V) {
  return is$typed(v, id, hashTallySteps)
}

export function validateTallySteps<V>(v: V) {
  return validate<TallySteps & V>(v, id, hashTallySteps)
}

export interface Step {
  $type?: 'com.para.community.getAuditTrail#step'
  description: string
  value: string
}

const hashStep = 'step'

export function isStep<V>(v: V) {
  return is$typed(v, id, hashStep)
}

export function validateStep<V>(v: V) {
  return validate<Step & V>(v, id, hashStep)
}

export interface TallyResult {
  $type?: 'com.para.community.getAuditTrail#tallyResult'
  voteCount: number
  signalSum: string
  signalAverage: string
  quorumMet: boolean
  quorumTarget?: number
  effectiveWeightSum?: string
}

const hashTallyResult = 'tallyResult'

export function isTallyResult<V>(v: V) {
  return is$typed(v, id, hashTallyResult)
}

export function validateTallyResult<V>(v: V) {
  return validate<TallyResult & V>(v, id, hashTallyResult)
}

export interface ConcentrationMetrics {
  $type?: 'com.para.community.getAuditTrail#concentrationMetrics'
  /** Max effective weight / total effective weight (post-√n) */
  maxWeightRatio: string
  /** 1 / HHI over effective weights */
  effectiveParticipants: string
  /** Percentage of delegations revoked */
  revocationRate: string
  /** Percentage of votes cast directly */
  directVotePct: string
  shadowMode: boolean
}

const hashConcentrationMetrics = 'concentrationMetrics'

export function isConcentrationMetrics<V>(v: V) {
  return is$typed(v, id, hashConcentrationMetrics)
}

export function validateConcentrationMetrics<V>(v: V) {
  return validate<ConcentrationMetrics & V>(v, id, hashConcentrationMetrics)
}
