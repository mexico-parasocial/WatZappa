// @ts-nocheck
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
const id = 'com.para.identity.linkedChat'

export interface Main {
  $type: 'com.para.identity.linkedChat'
  /** Identifier of the chat provider, e.g. 'solidarity.social' or 'para.social'. Also serves as the record key (one link record per provider). */
  provider: string
  /** The full Matrix user id on that provider, e.g. '@user:matrix.solidarity.social'. */
  matrixUserId: string
  /** Present only in the reciprocal record written to the external-provider-linked account: the PARA DID this record vouches for. */
  paraDid?: string
  /** When the link was established. */
  linkedAt: string
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
