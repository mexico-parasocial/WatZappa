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
  /** Moderator explanation, from the publicNote on the closing activity. Absent if none was written. */
  note?: string
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
  /** Policies that were applied in this action. */
  policies?: string[]
}

const hashActionView = 'actionView'

export function isActionView<V>(v: V) {
  return is$typed(v, id, hashActionView)
}

export function validateActionView<V>(v: V) {
  return validate<ActionView & V>(v, id, hashActionView)
}
