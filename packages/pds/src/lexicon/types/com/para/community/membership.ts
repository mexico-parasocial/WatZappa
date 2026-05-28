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
const id = 'com.para.community.membership'

export interface Main {
  $type: 'com.para.community.membership'
  /** Reference to the community board record. */
  community: string
  membershipState:
    | 'pending'
    | 'active'
    | 'left'
    | 'removed'
    | 'blocked'
    | (string & {})
  roles?: string[]
  /** Structured role assignments with expiration and ratification for horizontal governance. */
  roleAssignments?: RoleAssignment[]
  source?: string
  /** Assigned chamber for bicameral deliberation. Null until assigned by sortition. */
  chamberAssignment?: 'A' | 'B' | (string & {})
  joinedAt: string
  leftAt?: string
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

export interface RoleAssignment {
  $type?: 'com.para.community.membership#roleAssignment'
  role: string
  /** When this role assignment becomes valid. Defaults to creation time. */
  validFrom?: string
  /** When this role assignment expires. Required for horizontal governance rotations. */
  validUntil?: string
  /** Reference to an approved com.para.community.decision or com.para.civic.cabildeo record that ratified this role. */
  ratifiedBy?: string
}

const hashRoleAssignment = 'roleAssignment'

export function isRoleAssignment<V>(v: V) {
  return is$typed(v, id, hashRoleAssignment)
}

export function validateRoleAssignment<V>(v: V) {
  return validate<RoleAssignment & V>(v, id, hashRoleAssignment)
}
