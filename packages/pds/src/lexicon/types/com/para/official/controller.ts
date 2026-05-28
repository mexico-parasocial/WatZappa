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
const id = 'com.para.official.controller'

export interface Main {
  $type: 'com.para.official.controller'
  entity: string
  controllerDid: string
  displayName?: string
  scopes: (
    | 'official.profile.manage'
    | 'official.controllers.manage'
    | 'official.post.write'
    | 'official.pajareo.respond'
    | 'official.cabildeo.sign'
    | 'official.audit.view'
    | (string & {})
  )[]
  status: 'pending' | 'active' | 'revoked' | (string & {})
  visibilityDefault?: 'entity_default' | 'revealed' | (string & {})
  approvedByDid?: string
  expiresAt?: string
  revokedAt?: string
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
