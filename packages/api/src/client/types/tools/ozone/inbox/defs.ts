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
import type * as ComAtprotoAdminDefs from '../../../com/atproto/admin/defs.js'
import type * as ComAtprotoRepoStrongRef from '../../../com/atproto/repo/strongRef.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'tools.ozone.inbox.defs'

/** A subject belonging to the viewer that has moderation actions against it. */
export interface SubjectView {
  $type?: 'tools.ozone.inbox.defs#subjectView'
  /** DID of the moderation service that took the actions. */
  src: string
  subject:
    | $Typed<ComAtprotoAdminDefs.RepoRef>
    | $Typed<ComAtprotoRepoStrongRef.Main>
    | { $type: string }
  enforcement: EnforcementView
  appeal?: AppealView
  availableActions?: ('appeal' | (string & {}))[]
  latestAction?: ActionView
  actionCount?: number
  createdAt: string
  updatedAt: string
  isRead: boolean
}

const hashSubjectView = 'subjectView'

export function isSubjectView<V>(v: V) {
  return is$typed(v, id, hashSubjectView)
}

export function validateSubjectView<V>(v: V) {
  return validate<SubjectView & V>(v, id, hashSubjectView)
}

/** The current enforcement state of a subject. */
export interface EnforcementView {
  $type?: 'tools.ozone.inbox.defs#enforcementView'
  state:
    'none' | 'labeled' | 'removed' | 'suspended' | 'takendown' | (string & {})
  scope?: 'network' | 'app' | 'labelOnly' | (string & {})
  expiresAt?: string
  /** Active label values on the subject, excluding negated and expired labels. */
  labels?: string[]
}

const hashEnforcementView = 'enforcementView'

export function isEnforcementView<V>(v: V) {
  return is$typed(v, id, hashEnforcementView)
}

export function validateEnforcementView<V>(v: V) {
  return validate<EnforcementView & V>(v, id, hashEnforcementView)
}

/** The state of the viewer's appeal against the actions on a subject. */
export interface AppealView {
  $type?: 'tools.ozone.inbox.defs#appealView'
  state:
    'none' | 'pending' | 'resolved' | 'superseded' | 'expired' | (string & {})
  appealedAt?: string
  /** When the appeal's report was closed. */
  resolvedAt?: string
  /** Decision on a resolved appeal. */
  outcome?: 'approved' | 'denied' | (string & {})
  appealableUntil?: string
}

const hashAppealView = 'appealView'

export function isAppealView<V>(v: V) {
  return is$typed(v, id, hashAppealView)
}

export function validateAppealView<V>(v: V) {
  return validate<AppealView & V>(v, id, hashAppealView)
}

/** A single moderation action taken against a subject. */
export interface ActionView {
  $type?: 'tools.ozone.inbox.defs#actionView'
  /** Action ID (moderation event ID). */
  id: number
  /** Public action type. */
  type: string
  scope?: 'network' | 'app' | 'labelOnly' | (string & {})
  createdAt: string
  reversedAt?: string
  expiresAt?: string
  /** Label values, for labelApplied/labelRemoved. */
  labels?: string[]
  /** Policies applied by a takedown action. */
  policies?: PolicyView[]
}

const hashActionView = 'actionView'

export function isActionView<V>(v: V) {
  return is$typed(v, id, hashActionView)
}

export function validateActionView<V>(v: V) {
  return validate<ActionView & V>(v, id, hashActionView)
}

export interface PolicyView {
  $type?: 'tools.ozone.inbox.defs#policyView'
  key: string
  displayName: string
  link: string
}

const hashPolicyView = 'policyView'

export function isPolicyView<V>(v: V) {
  return is$typed(v, id, hashPolicyView)
}

export function validatePolicyView<V>(v: V) {
  return validate<PolicyView & V>(v, id, hashPolicyView)
}

/** A subject with a page of its action history and an aggregate report summary. Follow cursor to retrieve older actions; enforcement and appeal describe the current subject state on every page. */
export interface SubjectViewDetail {
  $type?: 'tools.ozone.inbox.defs#subjectViewDetail'
  src: string
  isRead: boolean
  subject:
    | $Typed<ComAtprotoAdminDefs.RepoRef>
    | $Typed<ComAtprotoRepoStrongRef.Main>
    | { $type: string }
  /** Raw record JSON for the subject, when the subject is a record and the record is available. */
  record?: { [_ in string]: unknown }
  enforcement: EnforcementView
  appeal?: AppealView
  availableActions?: ('appeal' | (string & {}))[]
  /** A page of action history, most recent first. Reversal timestamps include changes outside this page. */
  actions: ActionView[]
  /** Cursor for the next page of action history. Omitted when no older actions remain. */
  cursor?: string
  reports?: ReportsSummary
  createdAt: string
  updatedAt: string
}

const hashSubjectViewDetail = 'subjectViewDetail'

export function isSubjectViewDetail<V>(v: V) {
  return is$typed(v, id, hashSubjectViewDetail)
}

export function validateSubjectViewDetail<V>(v: V) {
  return validate<SubjectViewDetail & V>(v, id, hashSubjectViewDetail)
}

/** Aggregate view of reports filed against this subject. Deliberately carries no report IDs, no count, and no reporter identities. */
export interface ReportsSummary {
  $type?: 'tools.ozone.inbox.defs#reportsSummary'
  /** Distinct reason types reported, deduplicated and unordered. Excludes reasonAppeal. */
  reasonTypes: string[]
  /** Day of the earliest report, truncated to midnight UTC. Render as a date; the time component is not meaningful. */
  firstReportedOn: string
  /** Day of the most recent report, truncated to midnight UTC. Render as a date; the time component is not meaningful. */
  lastReportedOn: string
}

const hashReportsSummary = 'reportsSummary'

export function isReportsSummary<V>(v: V) {
  return is$typed(v, id, hashReportsSummary)
}

export function validateReportsSummary<V>(v: V) {
  return validate<ReportsSummary & V>(v, id, hashReportsSummary)
}

export interface Notification {
  $type?: 'tools.ozone.inbox.defs#notification'
  id: number
  reason:
    | 'reportResolved'
    | 'reportReopened'
    | 'actionTaken'
    | 'actionReversed'
    | 'appealResolved'
    | 'standingChanged'
    | (string & {})
  target:
    | $Typed<ReportRef>
    | $Typed<SubjectRef>
    | $Typed<StandingRef>
    | { $type: string }
  isRead: boolean
  createdAt: string
}

const hashNotification = 'notification'

export function isNotification<V>(v: V) {
  return is$typed(v, id, hashNotification)
}

export function validateNotification<V>(v: V) {
  return validate<Notification & V>(v, id, hashNotification)
}

/** Push notification preferences by moderation notification category. These preferences do not hide in-app inbox activity. Each category defaults to enabled. */
export interface NotificationPreferences {
  $type?: 'tools.ozone.inbox.defs#notificationPreferences'
  /** Notify about outcomes of reports filed by the account (reportResolved and reportReopened). */
  reports: boolean
  /** Notify about moderation actions against the account or its content, action reversals, appeal outcomes, and standing changes. Label application and removal are controlled by labels. */
  account: boolean
  /** Notify when labels are applied to or removed from the account or its content (labelApplied and labelRemoved actions). */
  labels: boolean
}

const hashNotificationPreferences = 'notificationPreferences'

export function isNotificationPreferences<V>(v: V) {
  return is$typed(v, id, hashNotificationPreferences)
}

export function validateNotificationPreferences<V>(v: V) {
  return validate<NotificationPreferences & V>(
    v,
    id,
    hashNotificationPreferences,
  )
}

/** Reference to a report by its report table ID, as used by getReport and Ozone's report detail page. */
export interface ReportRef {
  $type?: 'tools.ozone.inbox.defs#reportRef'
  reportId: number
  subject?:
    | $Typed<ComAtprotoAdminDefs.RepoRef>
    | $Typed<ComAtprotoRepoStrongRef.Main>
    | { $type: string }
  status?: 'pending' | 'resolved' | (string & {})
}

const hashReportRef = 'reportRef'

export function isReportRef<V>(v: V) {
  return is$typed(v, id, hashReportRef)
}

export function validateReportRef<V>(v: V) {
  return validate<ReportRef & V>(v, id, hashReportRef)
}

export interface SubjectRef {
  $type?: 'tools.ozone.inbox.defs#subjectRef'
  /** Decision captured when an appealResolved notification was created. Omitted when the outcome is unknown. */
  appealOutcome?: 'approved' | 'denied' | (string & {})
  subject:
    | $Typed<ComAtprotoAdminDefs.RepoRef>
    | $Typed<ComAtprotoRepoStrongRef.Main>
    | { $type: string }
  actionType?: string
  actionId?: number
}

const hashSubjectRef = 'subjectRef'

export function isSubjectRef<V>(v: V) {
  return is$typed(v, id, hashSubjectRef)
}

export function validateSubjectRef<V>(v: V) {
  return validate<SubjectRef & V>(v, id, hashSubjectRef)
}

export interface StandingRef {
  $type?: 'tools.ozone.inbox.defs#standingRef'
  standing: 'good' | 'warning' | 'atRisk' | (string & {})
  previousStanding?: 'good' | 'warning' | 'atRisk' | (string & {})
}

const hashStandingRef = 'standingRef'

export function isStandingRef<V>(v: V) {
  return is$typed(v, id, hashStandingRef)
}

export function validateStandingRef<V>(v: V) {
  return validate<StandingRef & V>(v, id, hashStandingRef)
}
