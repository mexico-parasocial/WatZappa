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
const id = 'com.para.community.governanceConfig'

export interface Main {
  $type: 'com.para.community.governanceConfig'
  /** Community this governance config applies to */
  community: string
  /** Semver of this config. Changes only by direct flat vote (no delegation). */
  version: string
  metaRules: MetaRules
  deliberation?: DeliberationRules
  delegation?: DelegationRules
  counting?: CountingRules
  visibility?: VisibilityRules
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

export interface MetaRules {
  $type?: 'com.para.community.governanceConfig#metaRules'
  /** Minimum participation % for a vote to be valid */
  quorumPct: number
  /** Approval threshold for ordinary proposals */
  thresholdPct: number
  /** Higher quorum required to amend this config itself */
  amendmentQuorumPct: number
  /** Cap on quadratic voice credits per voter per proposal */
  maxIntensityUnits?: number
}

const hashMetaRules = 'metaRules'

export function isMetaRules<V>(v: V) {
  return is$typed(v, id, hashMetaRules)
}

export function validateMetaRules<V>(v: V) {
  return validate<MetaRules & V>(v, id, hashMetaRules)
}

export interface DeliberationRules {
  $type?: 'com.para.community.governanceConfig#deliberationRules'
  /** Hours of mandatory deliberation before voting opens */
  windowHours?: number
  /** Minimum statements required to open voting */
  minStatements?: number
  /** Whether Polis-style clustering is active */
  clusteringEnabled?: boolean
}

const hashDeliberationRules = 'deliberationRules'

export function isDeliberationRules<V>(v: V) {
  return is$typed(v, id, hashDeliberationRules)
}

export function validateDeliberationRules<V>(v: V) {
  return validate<DeliberationRules & V>(v, id, hashDeliberationRules)
}

export interface DelegationRules {
  $type?: 'com.para.community.governanceConfig#delegationRules'
  /** Roles that can receive delegation: representative, moderator, official, board_member, etc. */
  eligibleRoles?: string[]
  /** Max delegation hops. PARA default is 1. */
  maxDepth?: number
  /** Default delegation expiry in days */
  autoExpireDays?: number
}

const hashDelegationRules = 'delegationRules'

export function isDelegationRules<V>(v: V) {
  return is$typed(v, id, hashDelegationRules)
}

export function validateDelegationRules<V>(v: V) {
  return validate<DelegationRules & V>(v, id, hashDelegationRules)
}

export interface CountingRules {
  $type?: 'com.para.community.governanceConfig#countingRules'
  /** Available tally modes. Only flat is binding; others run in shadow mode until explicitly promoted. */
  modes?: ('flat' | 'sqrt_n' | 'correlation_adjusted')[]
  /** Correlation discount strength, fixed-point scaled by 10000 (e.g. 2500 = 0.25). 0 = disabled. */
  correlationAlpha?: number
  /** Which mode currently produces the binding tally. Default: flat. */
  bindingMode?: 'flat' | 'sqrt_n' | 'correlation_adjusted'
}

const hashCountingRules = 'countingRules'

export function isCountingRules<V>(v: V) {
  return is$typed(v, id, hashCountingRules)
}

export function validateCountingRules<V>(v: V) {
  return validate<CountingRules & V>(v, id, hashCountingRules)
}

export interface VisibilityRules {
  $type?: 'com.para.community.governanceConfig#visibilityRules'
  /** Whether deliberation statements are publicly visible */
  deliberationPublic?: boolean
  /** Whether individual votes are public or only aggregates */
  votesPublic?: boolean
  /** Whether delegation chains are publicly observable */
  delegationGraphPublic?: boolean
}

const hashVisibilityRules = 'visibilityRules'

export function isVisibilityRules<V>(v: V) {
  return is$typed(v, id, hashVisibilityRules)
}

export function validateVisibilityRules<V>(v: V) {
  return validate<VisibilityRules & V>(v, id, hashVisibilityRules)
}

/** Term limits and rotation constraints for horizontal governance. */
export interface RoleRotationRules {
  $type?: 'com.para.community.governanceConfig#roleRotationRules'
  facilitatorMaxDays?: number
  moderatorMaxDays?: number
  stewardMaxDays?: number
  /** Whether role changes require an approved assembly decision record. */
  requiresAssemblyRatification?: boolean
}

const hashRoleRotationRules = 'roleRotationRules'

export function isRoleRotationRules<V>(v: V) {
  return is$typed(v, id, hashRoleRotationRules)
}

export function validateRoleRotationRules<V>(v: V) {
  return validate<RoleRotationRules & V>(v, id, hashRoleRotationRules)
}
