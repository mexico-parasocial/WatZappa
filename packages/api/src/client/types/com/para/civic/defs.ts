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
import type * as ComParaCommunityDefs from '../community/defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.civic.defs'

export interface CabildeoOption {
  $type?: 'com.para.civic.defs#cabildeoOption'
  label: string
  description?: string
  isConsensus?: boolean
}

const hashCabildeoOption = 'cabildeoOption'

export function isCabildeoOption<V>(v: V) {
  return is$typed(v, id, hashCabildeoOption)
}

export function validateCabildeoOption<V>(v: V) {
  return validate<CabildeoOption & V>(v, id, hashCabildeoOption)
}

export interface OptionSummary {
  $type?: 'com.para.civic.defs#optionSummary'
  optionIndex: number
  label: string
  votes: number
  effectivePowerMicros?: number
  positions: number
}

const hashOptionSummary = 'optionSummary'

export function isOptionSummary<V>(v: V) {
  return is$typed(v, id, hashOptionSummary)
}

export function validateOptionSummary<V>(v: V) {
  return validate<OptionSummary & V>(v, id, hashOptionSummary)
}

export interface PositionCounts {
  $type?: 'com.para.civic.defs#positionCounts'
  total: number
  for: number
  against: number
  amendment: number
  byOption: OptionSummary[]
}

const hashPositionCounts = 'positionCounts'

export function isPositionCounts<V>(v: V) {
  return is$typed(v, id, hashPositionCounts)
}

export function validatePositionCounts<V>(v: V) {
  return validate<PositionCounts & V>(v, id, hashPositionCounts)
}

export interface VoteTotals {
  $type?: 'com.para.civic.defs#voteTotals'
  total: number
  direct: number
  delegated: number
}

const hashVoteTotals = 'voteTotals'

export function isVoteTotals<V>(v: V) {
  return is$typed(v, id, hashVoteTotals)
}

export function validateVoteTotals<V>(v: V) {
  return validate<VoteTotals & V>(v, id, hashVoteTotals)
}

export interface PartyVoteSummary {
  $type?: 'com.para.civic.defs#partyVoteSummary'
  party: string
  total: number
  byOption: number[]
}

const hashPartyVoteSummary = 'partyVoteSummary'

export function isPartyVoteSummary<V>(v: V) {
  return is$typed(v, id, hashPartyVoteSummary)
}

export function validatePartyVoteSummary<V>(v: V) {
  return validate<PartyVoteSummary & V>(v, id, hashPartyVoteSummary)
}

export interface OutcomeSummary {
  $type?: 'com.para.civic.defs#outcomeSummary'
  winningOption?: number
  totalParticipants: number
  effectiveTotalPower: number
  effectiveTotalPowerMicros?: number
  tie: boolean
  breakdown: OptionSummary[]
}

const hashOutcomeSummary = 'outcomeSummary'

export function isOutcomeSummary<V>(v: V) {
  return is$typed(v, id, hashOutcomeSummary)
}

export function validateOutcomeSummary<V>(v: V) {
  return validate<OutcomeSummary & V>(v, id, hashOutcomeSummary)
}

export interface ViewerContext {
  $type?: 'com.para.civic.defs#viewerContext'
  canCastCabildeoVote?: boolean
  currentVoteOption?: number
  currentVoteIsDirect?: boolean
  currentVoteCreatedAt?: string
  activeDelegation?: string
  delegateHasVoted?: boolean
  delegatedVoteOption?: number
  delegatedVotedAt?: string
  gracePeriodEndsAt?: string
  delegateVoteDismissed?: boolean
}

const hashViewerContext = 'viewerContext'

export function isViewerContext<V>(v: V) {
  return is$typed(v, id, hashViewerContext)
}

export function validateViewerContext<V>(v: V) {
  return validate<ViewerContext & V>(v, id, hashViewerContext)
}

export interface LiveSessionView {
  $type?: 'com.para.civic.defs#liveSessionView'
  isLive: boolean
  hostDid: string
  activeParticipantCount: number
  startedAt: string
  participantPreviewDids: string[]
}

const hashLiveSessionView = 'liveSessionView'

export function isLiveSessionView<V>(v: V) {
  return is$typed(v, id, hashLiveSessionView)
}

export function validateLiveSessionView<V>(v: V) {
  return validate<LiveSessionView & V>(v, id, hashLiveSessionView)
}

export interface CabildeoLive {
  $type?: 'com.para.civic.defs#cabildeoLive'
  cabildeoUri: string
  community: string
  phase:
    'draft' | 'open' | 'deliberating' | 'voting' | 'resolved' | (string & {})
  expiresAt: string
}

const hashCabildeoLive = 'cabildeoLive'

export function isCabildeoLive<V>(v: V) {
  return is$typed(v, id, hashCabildeoLive)
}

export function validateCabildeoLive<V>(v: V) {
  return validate<CabildeoLive & V>(v, id, hashCabildeoLive)
}

/** The assembly's count for a resolved cabildeo and the next authority event it may ground. The AppView recomputes all of it from the final tally. */
export interface AssemblyDecisionView {
  $type?: 'com.para.civic.defs#assemblyDecisionView'
  /** Why this cabildeo cannot ground an authority event, when it cannot. */
  problem?:
    | 'unknown-cabildeo'
    | 'not-resolved'
    | 'wrong-community'
    | 'record-changed'
    | 'too-short'
    | 'not-decidable'
    | 'options'
    | 'not-admissible'
    | (string & {})
  action?: string
  subject?: string
  policy?: 'assembly_majority' | 'assembly_supermajority' | (string & {})
  outcome?: AssemblyOutcome
  event?: AssemblyEvent
  /** The authority event this cabildeo already grounds. */
  appliedEvent?: string
}

const hashAssemblyDecisionView = 'assemblyDecisionView'

export function isAssemblyDecisionView<V>(v: V) {
  return is$typed(v, id, hashAssemblyDecisionView)
}

export function validateAssemblyDecisionView<V>(v: V) {
  return validate<AssemblyDecisionView & V>(v, id, hashAssemblyDecisionView)
}

export interface AssemblyOutcome {
  $type?: 'com.para.civic.defs#assemblyOutcome'
  approved: boolean
  reason:
    | 'approved'
    | 'no-ballots'
    | 'quorum-not-met'
    | 'threshold-not-met'
    | (string & {})
  electorate: number
  quorumTarget: number
  participants: number
  approvals: number
  rejections: number
}

const hashAssemblyOutcome = 'assemblyOutcome'

export function isAssemblyOutcome<V>(v: V) {
  return is$typed(v, id, hashAssemblyOutcome)
}

export function validateAssemblyOutcome<V>(v: V) {
  return validate<AssemblyOutcome & V>(v, id, hashAssemblyOutcome)
}

/** The com.para.community.authorityEvent to publish, with basis assemblyDecision. Issuer is whoever publishes it; effectiveAt must not precede the cabildeo's close. */
export interface AssemblyEvent {
  $type?: 'com.para.civic.defs#assemblyEvent'
  action: string
  subject: string
  version: number
  predecessor?: string
  evidence: string
}

const hashAssemblyEvent = 'assemblyEvent'

export function isAssemblyEvent<V>(v: V) {
  return is$typed(v, id, hashAssemblyEvent)
}

export function validateAssemblyEvent<V>(v: V) {
  return validate<AssemblyEvent & V>(v, id, hashAssemblyEvent)
}

export interface CabildeoView {
  $type?: 'com.para.civic.defs#cabildeoView'
  uri: string
  cid: CID
  creator: string
  indexedAt: string
  title: string
  description: string
  community: string
  communities?: string[]
  flairs?: string[]
  region?: string
  geoRestricted?: boolean
  geo?: GeoPoint
  options: CabildeoOption[]
  minQuorum?: number
  /** A missing kind on the record is served as activity. */
  kind?: 'activity' | 'persuasion' | 'forum' | (string & {})
  voteVisibility?: 'public' | 'party_only' | 'anonymous' | (string & {})
  phase:
    'draft' | 'open' | 'deliberating' | 'voting' | 'resolved' | (string & {})
  minimumViewTier?: string
  minimumParticipationTier?: string
  protectedAction?: ComParaCommunityDefs.ProtectedAction
  assemblyDecision?: AssemblyDecisionView
  votingOpenedAt?: string
  votingClosedAt?: string
  phaseDeadline?: string
  createdAt: string
  optionSummary: OptionSummary[]
  positionCounts: PositionCounts
  voteTotals: VoteTotals
  partyVoteSummary?: PartyVoteSummary[]
  outcomeSummary?: OutcomeSummary
  viewerContext?: ViewerContext
  liveSession?: LiveSessionView
}

const hashCabildeoView = 'cabildeoView'

export function isCabildeoView<V>(v: V) {
  return is$typed(v, id, hashCabildeoView)
}

export function validateCabildeoView<V>(v: V) {
  return validate<CabildeoView & V>(v, id, hashCabildeoView)
}

export interface PositionView {
  $type?: 'com.para.civic.defs#positionView'
  uri: string
  cid: CID
  creator: string
  indexedAt: string
  cabildeo: string
  stance: 'for' | 'against' | 'amendment' | 'question' | (string & {})
  optionIndex?: number
  text: string
  compassQuadrant?: string
  createdAt: string
  /** Reactions of agree on this position (com.para.community.deliberationVote). */
  agreeCount?: number
  disagreeCount?: number
  passCount?: number
  /** Only ever the requesting viewer's own reaction; who else took which side is not part of this view. */
  viewerDirection?: 'agree' | 'disagree' | 'pass' | (string & {})
}

const hashPositionView = 'positionView'

export function isPositionView<V>(v: V) {
  return is$typed(v, id, hashPositionView)
}

export function validatePositionView<V>(v: V) {
  return validate<PositionView & V>(v, id, hashPositionView)
}

export interface PolicySignalBucket {
  $type?: 'com.para.civic.defs#policySignalBucket'
  signal: number
  count: number
}

const hashPolicySignalBucket = 'policySignalBucket'

export function isPolicySignalBucket<V>(v: V) {
  return is$typed(v, id, hashPolicySignalBucket)
}

export function validatePolicySignalBucket<V>(v: V) {
  return validate<PolicySignalBucket & V>(v, id, hashPolicySignalBucket)
}

export interface PolicyTally {
  $type?: 'com.para.civic.defs#policyTally'
  subject: string
  subjectType: 'policy' | (string & {})
  community: string
  voteCount: number
  directVoteCount: number
  delegatedVoteCount: number
  signalSum: number
  signalAverage: string
  eligibleVoterCount: number
  quorumTarget: number
  quorumMet: boolean
  /** DEPRECATED 2026-11-06 (OD-10 §7.6), always false; to be removed. It came from the author's own post metadata, so it never established that an official account published the policy, and a policy result no longer depends on who published it. */
  official: boolean
  /** DEPRECATED 2026-11-06 (OD-10 §7.6); to be removed. True when `outcome` is `passed` or `strong_passed`. A policy never closes, so nothing certifies it: read `outcome` instead. */
  certified: boolean
  /** A live reading of what the community's current ballots say, which changes as people change their votes. It binds no one: a binding decision goes through a cabildeo (OD-10 §7.6). */
  outcome:
    | 'insufficient_quorum'
    | 'contested'
    | 'passed'
    | 'strong_passed'
    | 'failed'
    | (string & {})
  /** The live reading as a state: `passing`, `failing`, `split` (votes without a majority either way) or `noQuorum`. The other known values are DEPRECATED 2026-11-06 (OD-10 §7.6), never returned, and will be removed. */
  state:
    | 'passing'
    | 'failing'
    | 'split'
    | 'noQuorum'
    | 'draft'
    | 'deliberation'
    | 'voting'
    | 'passed'
    | 'failed'
    | 'official'
    | (string & {})
  breakdown: PolicySignalBucket[]
  computedAt: string
}

const hashPolicyTally = 'policyTally'

export function isPolicyTally<V>(v: V) {
  return is$typed(v, id, hashPolicyTally)
}

export function validatePolicyTally<V>(v: V) {
  return validate<PolicyTally & V>(v, id, hashPolicyTally)
}

/** Geographic coordinates in E7 (degrees × 10⁷) for map placement. */
export interface GeoPoint {
  $type?: 'com.para.civic.defs#geoPoint'
  latE7: number
  lngE7: number
}

const hashGeoPoint = 'geoPoint'

export function isGeoPoint<V>(v: V) {
  return is$typed(v, id, hashGeoPoint)
}

export function validateGeoPoint<V>(v: V) {
  return validate<GeoPoint & V>(v, id, hashGeoPoint)
}
