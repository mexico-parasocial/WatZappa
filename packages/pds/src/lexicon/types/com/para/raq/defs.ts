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
const id = 'com.para.raq.defs'

export interface AxisResult {
  $type?: 'com.para.raq.defs#axisResult'
  axisId: string
  axisTitle: string
  score: number
  label: string
  labelLow?: string
  labelHigh?: string
  rawScore?: number
}

const hashAxisResult = 'axisResult'

export function isAxisResult<V>(v: V) {
  return is$typed(v, id, hashAxisResult)
}

export function validateAxisResult<V>(v: V) {
  return validate<AxisResult & V>(v, id, hashAxisResult)
}

export interface IdeologyMatch {
  $type?: 'com.para.raq.defs#ideologyMatch'
  name: string
  description: string
  matchPercent: number
}

const hashIdeologyMatch = 'ideologyMatch'

export function isIdeologyMatch<V>(v: V) {
  return is$typed(v, id, hashIdeologyMatch)
}

export function validateIdeologyMatch<V>(v: V) {
  return validate<IdeologyMatch & V>(v, id, hashIdeologyMatch)
}

export interface PartyMatch {
  $type?: 'com.para.raq.defs#partyMatch'
  partyId: string
  partyName: string
  partyFullName?: string
  partyColor?: string
  matchPercent: number
}

const hashPartyMatch = 'partyMatch'

export function isPartyMatch<V>(v: V) {
  return is$typed(v, id, hashPartyMatch)
}

export function validatePartyMatch<V>(v: V) {
  return validate<PartyMatch & V>(v, id, hashPartyMatch)
}

export interface CompassPosition {
  $type?: 'com.para.raq.defs#compassPosition'
  /** Scaled by 1000, e.g. -500 = -0.5 */
  x: number
  /** Scaled by 1000, e.g. 750 = 0.75 */
  y: number
  ninth: string
}

const hashCompassPosition = 'compassPosition'

export function isCompassPosition<V>(v: V) {
  return is$typed(v, id, hashCompassPosition)
}

export function validateCompassPosition<V>(v: V) {
  return validate<CompassPosition & V>(v, id, hashCompassPosition)
}

export interface CommunityAxisView {
  $type?: 'com.para.raq.defs#communityAxisView'
  id: string
  name: string
  description: string
  color?: string
  votes: number
  author?: string
  viewerHasVoted?: boolean
}

const hashCommunityAxisView = 'communityAxisView'

export function isCommunityAxisView<V>(v: V) {
  return is$typed(v, id, hashCommunityAxisView)
}

export function validateCommunityAxisView<V>(v: V) {
  return validate<CommunityAxisView & V>(v, id, hashCommunityAxisView)
}

export interface ProposedQuestionView {
  $type?: 'com.para.raq.defs#proposedQuestionView'
  id: string
  text: string
  targetCommunity?: string
  upvotes: number
  downvotes: number
  isMainstream: boolean
  viewerHasUpvoted?: boolean
  viewerHasDownvoted?: boolean
  createdAt?: string
  creator?: string
}

const hashProposedQuestionView = 'proposedQuestionView'

export function isProposedQuestionView<V>(v: V) {
  return is$typed(v, id, hashProposedQuestionView)
}

export function validateProposedQuestionView<V>(v: V) {
  return validate<ProposedQuestionView & V>(v, id, hashProposedQuestionView)
}
