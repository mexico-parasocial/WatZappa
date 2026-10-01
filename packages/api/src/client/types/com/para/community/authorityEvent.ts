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
const id = 'com.para.community.authorityEvent'

export interface Main {
  $type: 'com.para.community.authorityEvent'
  community: string
  subject: string
  action:
    | 'member.activate'
    | 'member.suspend'
    | 'member.reinstate'
    | 'member.remove'
    | 'member.block'
    | 'moderator.grant'
    | 'moderator.revoke'
    | 'moderator.resign'
    | 'owner.grant'
    | 'owner.revoke'
    | (string & {})
  issuer: string
  effectiveAt: string
  expiresAt?: string
  predecessor?: string
  version: number
  basis:
    | 'openAdmission'
    | 'assemblyDecision'
    | 'ownerAppointment'
    | 'ownerTransfer'
    | 'foundingTransition'
    | 'resignation'
    | 'expiry'
    | 'migration'
    | (string & {})
  evidence?: string
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
