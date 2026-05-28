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
import type * as ComParaCommunityDefs from './defs.js'
import type * as ComParaCommunityGovernanceConfig from './governanceConfig.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.community.governance'

export interface Main {
  $type: 'com.para.community.governance'
  community: string
  communityId?: string
  slug: string
  createdAt: string
  updatedAt: string
  moderators: ComParaCommunityDefs.ModeratorView[]
  officials: ComParaCommunityDefs.OfficialView[]
  deputies: ComParaCommunityDefs.DeputyRoleView[]
  metadata?: ComParaCommunityDefs.Metadata
  roleRotationRules?: ComParaCommunityGovernanceConfig.RoleRotationRules
  editHistory?: ComParaCommunityDefs.HistoryEntry[]
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
