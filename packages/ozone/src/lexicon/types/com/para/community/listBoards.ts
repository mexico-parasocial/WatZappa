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
const id = 'com.para.community.listBoards'

export type QueryParams = {
  query?: string
  state?: string
  participationKind?: 'matter' | 'policy' | (string & {})
  flairId?: string
  sort: 'recent' | 'activity' | 'size' | (string & {})
  limit: number
  cursor?: string
  /** Optional territory quadrant to filter communities by */
  quadrant?: string
}
export type InputSchema = undefined
export type OutputSchema = Output
export type HandlerInput = void

export interface HandlerSuccess {
  encoding: 'application/json'
  body: OutputSchema
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
}

export type HandlerOutput = HandlerError | HandlerSuccess

export interface BoardView {
  $type?: 'com.para.community.listBoards#boardView'
  uri: string
  cid: string
  creatorDid: string
  creatorHandle?: string
  creatorDisplayName?: string
  communityId: string
  slug: string
  name: string
  description?: string
  quadrant: string
  delegatesChatId: string
  subdelegatesChatId: string
  memberCount: number
  viewerMembershipState:
    | 'none'
    | 'pending'
    | 'active'
    | 'left'
    | 'removed'
    | 'blocked'
    | (string & {})
  viewerRoles?: string[]
  status?: 'draft' | 'active' | (string & {})
  founderStarterPackUri?: string
  governanceSummary?: GovernanceSummary
  createdAt: string
}

const hashBoardView = 'boardView'

export function isBoardView<V>(v: V) {
  return is$typed(v, id, hashBoardView)
}

export function validateBoardView<V>(v: V) {
  return validate<BoardView & V>(v, id, hashBoardView)
}

export interface GovernanceSummary {
  $type?: 'com.para.community.listBoards#governanceSummary'
  moderatorCount: number
  officialCount: number
  deputyRoleCount: number
  lastPublishedAt?: string
}

const hashGovernanceSummary = 'governanceSummary'

export function isGovernanceSummary<V>(v: V) {
  return is$typed(v, id, hashGovernanceSummary)
}

export function validateGovernanceSummary<V>(v: V) {
  return validate<GovernanceSummary & V>(v, id, hashGovernanceSummary)
}

export interface Output {
  $type?: 'com.para.community.listBoards#output'
  boards: BoardView[]
  cursor?: string
  canCreateCommunity: boolean
}

const hashOutput = 'output'

export function isOutput<V>(v: V) {
  return is$typed(v, id, hashOutput)
}

export function validateOutput<V>(v: V) {
  return validate<Output & V>(v, id, hashOutput)
}
