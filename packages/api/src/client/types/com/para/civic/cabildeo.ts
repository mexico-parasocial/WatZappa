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
const id = 'com.para.civic.cabildeo'

export interface Main {
  $type: 'com.para.civic.cabildeo'
  title: string
  description: string
  community: string
  communities?: string[]
  flairs?: string[]
  region?: string
  geoRestricted?: boolean
  geo?: GeoPoint
  options: CabildeoOption[]
  minQuorum?: number
  /** Minimum tier required to view the cabildeo. Existing records default to public. */
  minimumViewTier?:
    | 'public'
    | 'signed_in'
    | 'verified_human'
    | 'verified_area'
    | 'community_member'
    | 'delegate'
    | 'official_controller'
    | (string & {})
  /** Minimum tier required to vote, delegate, or publish a position. Existing records default to signed_in. */
  minimumParticipationTier?:
    | 'public'
    | 'signed_in'
    | 'verified_human'
    | 'verified_area'
    | 'community_member'
    | 'delegate'
    | 'official_controller'
    | (string & {})
  /** Controls how voter identity is exposed. Existing records default to public. */
  voteVisibility?: 'public' | 'party_only' | 'anonymous' | (string & {})
  phase:
    | 'draft'
    | 'open'
    | 'deliberating'
    | 'voting'
    | 'resolved'
    | (string & {})
  phaseDeadline?: string
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

export interface CabildeoOption {
  $type?: 'com.para.civic.cabildeo#cabildeoOption'
  label: string
  description?: string
}

const hashCabildeoOption = 'cabildeoOption'

export function isCabildeoOption<V>(v: V) {
  return is$typed(v, id, hashCabildeoOption)
}

export function validateCabildeoOption<V>(v: V) {
  return validate<CabildeoOption & V>(v, id, hashCabildeoOption)
}

/** Geographic coordinates in E7 (degrees × 10⁷) for map placement. */
export interface GeoPoint {
  $type?: 'com.para.civic.cabildeo#geoPoint'
  latE7: number
  lngE7: number
}

const hashGeoPoint = 'geoPoint'

export function isGeoPoint<V>(v: V) {
  return is$typed(v, id, hashGeoPoint)
}

export function validateGeoPoint<V>(v: V) {
  return validate<GeoPoint & V>(v, id, hashGeoPoint)
}
