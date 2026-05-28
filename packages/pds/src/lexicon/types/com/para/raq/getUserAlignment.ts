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
const id = 'com.para.raq.getUserAlignment'

export type QueryParams = {
  did: string
}
export type InputSchema = undefined

export interface OutputSchema {
  assessment: AssessmentView
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
  error?: 'NotFound'
}

export type HandlerOutput = HandlerError | HandlerSuccess

export interface AssessmentView {
  $type?: 'com.para.raq.getUserAlignment#assessmentView'
  results: ComParaRaqDefs.AxisResult[]
  compass: ComParaRaqDefs.CompassPosition
  ideology: ComParaRaqDefs.IdeologyMatch
  secondaryIdeology?: ComParaRaqDefs.IdeologyMatch
  partyMatches?: ComParaRaqDefs.PartyMatch[]
  completedAt?: string
}

const hashAssessmentView = 'assessmentView'

export function isAssessmentView<V>(v: V) {
  return is$typed(v, id, hashAssessmentView)
}

export function validateAssessmentView<V>(v: V) {
  return validate<AssessmentView & V>(v, id, hashAssessmentView)
}
