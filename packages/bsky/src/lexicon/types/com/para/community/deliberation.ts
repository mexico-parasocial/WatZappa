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
const id = 'com.para.community.deliberation'

export interface Main {
  $type: 'com.para.community.deliberation'
  /** URI of the proposal being deliberated on */
  proposal: string
  community: string
  author: string
  /** Short statement for deliberation, like a Polis comment */
  body: string
  /** Author's self-reported stance. Bridging = attempts to find common ground. */
  stance?: 'for' | 'against' | 'neutral' | 'bridging'
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
