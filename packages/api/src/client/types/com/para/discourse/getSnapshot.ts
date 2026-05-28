/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { HeadersMap, XRPCError } from '@atproto/xrpc'
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
const id = 'com.para.discourse.getSnapshot'

export type QueryParams = {
  subject: string
}
export type InputSchema = undefined

export interface OutputSchema {
  subject: string
  /** Short human-readable status (e.g., 'Altamente polarizado'). */
  status: string
  keyTakeaways: string[]
  consensusLevel: number
  participationMetrics?: ParticipationMetrics
  /** The ideological spread of the participants in this consensus. */
  compassDistribution?: CompassPoint[]
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export function toKnownErr(e: any) {
  return e
}

export interface ParticipationMetrics {
  $type?: 'com.para.discourse.getSnapshot#participationMetrics'
  totalVoices?: number
  /** Measure of ideological breadth from the compass. */
  diversityIndex?: number
}

const hashParticipationMetrics = 'participationMetrics'

export function isParticipationMetrics<V>(v: V) {
  return is$typed(v, id, hashParticipationMetrics)
}

export function validateParticipationMetrics<V>(v: V) {
  return validate<ParticipationMetrics & V>(v, id, hashParticipationMetrics)
}

export interface CompassPoint {
  $type?: 'com.para.discourse.getSnapshot#compassPoint'
  position:
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
  /** Percentage of voices coming from this quadrant (0-100). */
  density: number
}

const hashCompassPoint = 'compassPoint'

export function isCompassPoint<V>(v: V) {
  return is$typed(v, id, hashCompassPoint)
}

export function validateCompassPoint<V>(v: V) {
  return validate<CompassPoint & V>(v, id, hashCompassPoint)
}
