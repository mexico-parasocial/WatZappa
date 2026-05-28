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
const id = 'com.para.community.board'

export interface Main {
  $type: 'com.para.community.board'
  name: string
  description?: string
  /** Spatial mapping token indicating the nonant or 25th block. */
  quadrant: string
  geo?: GeoPoint
  /** Reference to the 270-member bounded bsky group chat. */
  delegatesChatId: string
  /** Reference to the 30-member bounded public-view bsky group chat. */
  subdelegatesChatId: string
  /** The lifecycle status of the community. */
  status: 'draft' | 'active' | (string & {})
  /** Reference to the starter pack used to track the founding member quorum. */
  founderStarterPackUri?: string
  /** Visibility of the community. */
  visibility: 'open' | 'closed' | 'secret' | (string & {})
  /** Deliberation structure. */
  chamberMode: 'unicameral' | 'bicameral' | (string & {})
  /** Governance model for this community. */
  governanceMode: 'hierarchical' | 'horizontal' | (string & {})
  createdAt: string
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

/** Geographic coordinates in E7 (degrees × 10⁷) for map placement. */
export interface GeoPoint {
  $type?: 'com.para.community.board#geoPoint'
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
