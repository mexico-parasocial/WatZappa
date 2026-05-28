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
const id = 'com.para.discourse.getTopology'

export type QueryParams = {
  /** Community identifier. Omit for global/network-wide topology. */
  community?: string
  timeframe: '1h' | '24h' | '7d' | '30d'
}
export type InputSchema = undefined

export interface OutputSchema {
  topology: DiscourseTopology
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

export interface DiscourseTopology {
  $type?: 'com.para.discourse.getTopology#discourseTopology'
  ideologicalCentroid: IdeologicalCentroid
  /** How dispersed the discourse is across the compass (0 = monoculture, 100 = maximally diverse). */
  ideologicalSpread: number
  /** Percentage of interactions (replies, votes, relationships) that cross compass quadrants. */
  crossCompassEngagement: number
  positionDensity: PositionDensity
  /** Top RAQ axes currently generating the most cross-position disagreement. */
  contestedAxes?: ContestedAxis[]
  argumentBalance: ArgumentBalance
  /** Suggested points where different ideological positions might find common ground. */
  bridgeOpportunities?: BridgeOpportunity[]
  proposalVelocity: ProposalVelocity
}

const hashDiscourseTopology = 'discourseTopology'

export function isDiscourseTopology<V>(v: V) {
  return is$typed(v, id, hashDiscourseTopology)
}

export function validateDiscourseTopology<V>(v: V) {
  return validate<DiscourseTopology & V>(v, id, hashDiscourseTopology)
}

export interface IdeologicalCentroid {
  $type?: 'com.para.discourse.getTopology#ideologicalCentroid'
  /** Economic axis: -1000 (Market) to +1000 (Planning) */
  x: number
  /** Authority axis: -1000 (Libertarian) to +1000 (Authoritarian) */
  y: number
}

const hashIdeologicalCentroid = 'ideologicalCentroid'

export function isIdeologicalCentroid<V>(v: V) {
  return is$typed(v, id, hashIdeologicalCentroid)
}

export function validateIdeologicalCentroid<V>(v: V) {
  return validate<IdeologicalCentroid & V>(v, id, hashIdeologicalCentroid)
}

/** Participation density per compass position (0-100 each). */
export interface PositionDensity {
  $type?: 'com.para.discourse.getTopology#positionDensity'
  authLeft?: number
  authCenter?: number
  authRight?: number
  centerLeft?: number
  center?: number
  centerRight?: number
  libLeft?: number
  libCenter?: number
  libRight?: number
}

const hashPositionDensity = 'positionDensity'

export function isPositionDensity<V>(v: V) {
  return is$typed(v, id, hashPositionDensity)
}

export function validatePositionDensity<V>(v: V) {
  return validate<PositionDensity & V>(v, id, hashPositionDensity)
}

export interface ArgumentBalance {
  $type?: 'com.para.discourse.getTopology#argumentBalance'
  claims: number
  evidence: number
  questions: number
  rebuttals: number
}

const hashArgumentBalance = 'argumentBalance'

export function isArgumentBalance<V>(v: V) {
  return is$typed(v, id, hashArgumentBalance)
}

export function validateArgumentBalance<V>(v: V) {
  return validate<ArgumentBalance & V>(v, id, hashArgumentBalance)
}

export interface ProposalVelocity {
  $type?: 'com.para.discourse.getTopology#proposalVelocity'
  proposed: number
  deliberating: number
  voting: number
  resolved: number
}

const hashProposalVelocity = 'proposalVelocity'

export function isProposalVelocity<V>(v: V) {
  return is$typed(v, id, hashProposalVelocity)
}

export function validateProposalVelocity<V>(v: V) {
  return validate<ProposalVelocity & V>(v, id, hashProposalVelocity)
}

export interface ContestedAxis {
  $type?: 'com.para.discourse.getTopology#contestedAxis'
  axisId: string
  axisTitle: string
  labelLow: string
  labelHigh: string
  /** Where discourse leans on this axis (0 = low label, 100 = high label). */
  discourseScore: number
  engagementCount: number
}

const hashContestedAxis = 'contestedAxis'

export function isContestedAxis<V>(v: V) {
  return is$typed(v, id, hashContestedAxis)
}

export function validateContestedAxis<V>(v: V) {
  return validate<ContestedAxis & V>(v, id, hashContestedAxis)
}

export interface BridgeOpportunity {
  $type?: 'com.para.discourse.getTopology#bridgeOpportunity'
  description: string
  topicOverlap: string[]
  positionsInvolved: (
    | 'auth-left'
    | 'auth-center'
    | 'auth-right'
    | 'center-left'
    | 'center'
    | 'center-right'
    | 'lib-left'
    | 'lib-center'
    | 'lib-right'
    | (string & {})
  )[]
}

const hashBridgeOpportunity = 'bridgeOpportunity'

export function isBridgeOpportunity<V>(v: V) {
  return is$typed(v, id, hashBridgeOpportunity)
}

export function validateBridgeOpportunity<V>(v: V) {
  return validate<BridgeOpportunity & V>(v, id, hashBridgeOpportunity)
}
