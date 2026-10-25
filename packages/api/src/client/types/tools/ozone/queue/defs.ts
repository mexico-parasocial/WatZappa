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
import type * as ToolsOzoneTeamDefs from '../team/defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'tools.ozone.queue.defs'

export interface QueueView {
  $type?: 'tools.ozone.queue.defs#queueView'
  /** Queue ID */
  id: number
  /** Display name of the queue */
  name: string
  /** Subject types this queue accepts. */
  subjectTypes?: (
    'account' | 'record' | 'message' | 'conversation' | (string & {})
  )[]
  /** Collection name for record subjects. Omit to accept every collection. */
  collection?: string
  /** Report reason types this queue accepts (fully qualified NSIDs) */
  reportTypes?: string[]
  /** Match any listed tag on the account submitting the report. */
  reporterTags?: string[]
  /** Match tags on the account that is being reported against. For record subjects, use the author account. Match any listed tag. */
  accountTags?: string[]
  /** Optional description of the queue */
  description?: string
  /** Policy keys recommended when actioning reports in this queue */
  recommendedPolicies?: string[]
  /** Labels recommended for this queue and used as a fallback when routing label appeals */
  recommendedLabels?: string[]
  /** DID of moderator who created this queue */
  createdBy: string
  createdAt: string
  updatedAt: string
  /** Whether this queue is currently active */
  enabled: boolean
  /** When the queue was deleted, if applicable */
  deletedAt?: string
  stats: QueueStats
  /** Admins can always list this queue and browse its reports. Other roles require an active queue assignment. Individual report and moderation event access is unchanged. */
  strictAccess?: boolean
}

const hashQueueView = 'queueView'

export function isQueueView<V>(v: V) {
  return is$typed(v, id, hashQueueView)
}

export function validateQueueView<V>(v: V) {
  return validate<QueueView & V>(v, id, hashQueueView)
}

export interface QueueStats {
  $type?: 'tools.ozone.queue.defs#queueStats'
  /** Number of unmuted reports currently not closed. */
  pendingCount?: number
  /** Unmuted pending reports past their closure target. */
  closureTargetOverdueCount?: number
  /** Reports whose closure meets their closure target. */
  closureTargetMetCount?: number
  /** Reports whose closure exceeds their closure target. */
  closureTargetMissedCount?: number
  /** Percent of reports meeting their closure target. */
  closureTargetMetRate?: number
  /** Number of reports whose current closure falls within this UTC calendar day. */
  closedCount?: number
  /** Number of closures whose last report action is label, tag, or takedown. */
  actionedCount?: number
  /** Number of closures whose last report action is not label, tag, or takedown. */
  acknowledgedCount?: number
  /** Number of report escalation events during this UTC calendar day. */
  escalatedCount?: number
  /** Reports received in this queue during this UTC calendar day. */
  inboundCount?: number
  /** Closures whose last report action is a label event. */
  labelActionCount?: number
  /** Closures whose last report action is a tag event. */
  tagActionCount?: number
  /** Closures whose last report action is a takedown event. */
  takedownActionCount?: number
  /** Sum of report assignment-to-close seconds. */
  ahtDurationSec?: number
  /** Number of assigned closed-report samples in ahtDurationSec. */
  ahtSampleCount?: number
  /** Sum of report creation-to-close seconds. */
  resolutionDurationSec?: number
  /** Number of closed-report samples in resolutionDurationSec. */
  resolutionSampleCount?: number
  /** Percentage of closures actioned (actionedCount / closedCount * 100), rounded to nearest integer. */
  actionRate?: number
  /** Average handling time in seconds from report assignment to close. */
  avgHandlingTimeSec?: number
  /** Average resolution time in seconds from report creation to close. */
  avgResolutionTimeSec?: number
  /** When these statistics were last computed. */
  lastUpdated?: string
}

const hashQueueStats = 'queueStats'

export function isQueueStats<V>(v: V) {
  return is$typed(v, id, hashQueueStats)
}

export function validateQueueStats<V>(v: V) {
  return validate<QueueStats & V>(v, id, hashQueueStats)
}

export interface AssignmentView {
  $type?: 'tools.ozone.queue.defs#assignmentView'
  id: number
  did: string
  moderator?: ToolsOzoneTeamDefs.Member
  queue: QueueView
  startAt: string
  endAt?: string
}

const hashAssignmentView = 'assignmentView'

export function isAssignmentView<V>(v: V) {
  return is$typed(v, id, hashAssignmentView)
}

export function validateAssignmentView<V>(v: V) {
  return validate<AssignmentView & V>(v, id, hashAssignmentView)
}
