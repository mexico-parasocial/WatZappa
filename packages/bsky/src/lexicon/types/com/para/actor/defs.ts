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
const id = 'com.para.actor.defs'

/** Aggregated Para profile statistics. */
export interface ProfileStats {
  $type?: 'com.para.actor.defs#profileStats'
  /** All-time influence score (Para equivalent of cumulative karma). */
  influence: number
  /** Total support received by this actor's Para posts across all time. */
  votesReceivedAllTime: number
  /** Total votes/interactions cast by this actor across all time. */
  votesCastAllTime: number
  contributions: Contributions
  /** Top communities where this actor contributes. */
  activeIn: string[]
  /** Timestamp of the last stats computation. */
  computedAt: string
}

const hashProfileStats = 'profileStats'

export function isProfileStats<V>(v: V) {
  return is$typed(v, id, hashProfileStats)
}

export function validateProfileStats<V>(v: V) {
  return validate<ProfileStats & V>(v, id, hashProfileStats)
}

/** All-time contribution counters. */
export interface Contributions {
  $type?: 'com.para.actor.defs#contributions'
  policies: number
  matters: number
  comments: number
}

const hashContributions = 'contributions'

export function isContributions<V>(v: V) {
  return is$typed(v, id, hashContributions)
}

export function validateContributions<V>(v: V) {
  return validate<Contributions & V>(v, id, hashContributions)
}

/** Resolved Para account status view. */
export interface StatusView {
  $type?: 'com.para.actor.defs#statusView'
  status: string
  party?: string
  community?: string
  createdAt: string
}

const hashStatusView = 'statusView'

export function isStatusView<V>(v: V) {
  return is$typed(v, id, hashStatusView)
}

export function validateStatusView<V>(v: V) {
  return validate<StatusView & V>(v, id, hashStatusView)
}
