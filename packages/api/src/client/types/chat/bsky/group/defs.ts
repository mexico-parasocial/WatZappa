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
import type * as ChatBskyActorDefs from '../actor/defs.js'
import type * as ChatBskyConvoDefs from '../convo/defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'chat.bsky.group.defs'

export type LinkEnabledStatus = 'enabled' | 'disabled' | (string & {})
export type JoinRule = 'anyone' | 'followedByOwner' | (string & {})

export interface JoinLinkView {
  $type?: 'chat.bsky.group.defs#joinLinkView'
  code: string
  enabledStatus: LinkEnabledStatus
  requireApproval: boolean
  joinRule: JoinRule
  createdAt: string
}

const hashJoinLinkView = 'joinLinkView'

export function isJoinLinkView<V>(v: V) {
  return is$typed(v, id, hashJoinLinkView)
}

export function validateJoinLinkView<V>(v: V) {
  return validate<JoinLinkView & V>(v, id, hashJoinLinkView)
}

export interface JoinLinkPreviewView {
  $type?: 'chat.bsky.group.defs#joinLinkPreviewView'
  code: string
  name: string
  owner: ChatBskyActorDefs.ProfileViewBasic
  memberCount: number
  memberLimit: number
  requireApproval: boolean
  joinRule: JoinRule
  enabledStatus: LinkEnabledStatus
  convo?: ChatBskyConvoDefs.ConvoView
  viewer?: JoinLinkViewerState
}

const hashJoinLinkPreviewView = 'joinLinkPreviewView'

export function isJoinLinkPreviewView<V>(v: V) {
  return is$typed(v, id, hashJoinLinkPreviewView)
}

export function validateJoinLinkPreviewView<V>(v: V) {
  return validate<JoinLinkPreviewView & V>(v, id, hashJoinLinkPreviewView)
}

export interface JoinLinkViewerState {
  $type?: 'chat.bsky.group.defs#joinLinkViewerState'
  requestedAt?: string
}

const hashJoinLinkViewerState = 'joinLinkViewerState'

export function isJoinLinkViewerState<V>(v: V) {
  return is$typed(v, id, hashJoinLinkViewerState)
}

export function validateJoinLinkViewerState<V>(v: V) {
  return validate<JoinLinkViewerState & V>(v, id, hashJoinLinkViewerState)
}

export interface GroupPublicView {
  $type?: 'chat.bsky.group.defs#groupPublicView'
  name: string
  owner: ChatBskyActorDefs.ProfileViewBasic
  memberCount: number
  requireApproval: boolean
}

const hashGroupPublicView = 'groupPublicView'

export function isGroupPublicView<V>(v: V) {
  return is$typed(v, id, hashGroupPublicView)
}

export function validateGroupPublicView<V>(v: V) {
  return validate<GroupPublicView & V>(v, id, hashGroupPublicView)
}

export interface JoinRequestView {
  $type?: 'chat.bsky.group.defs#joinRequestView'
  convoId: string
  requestedBy: ChatBskyActorDefs.ProfileViewBasic
  requestedAt: string
}

const hashJoinRequestView = 'joinRequestView'

export function isJoinRequestView<V>(v: V) {
  return is$typed(v, id, hashJoinRequestView)
}

export function validateJoinRequestView<V>(v: V) {
  return validate<JoinRequestView & V>(v, id, hashJoinRequestView)
}

/** A join request from the perspective of the requester, including enough group context to render the request in a list (e.g. group name, owner, member count). */
export interface JoinRequestConvoView {
  $type?: 'chat.bsky.group.defs#joinRequestConvoView'
  convoId: string
  name: string
  owner: ChatBskyActorDefs.ProfileViewBasic
  memberCount: number
  memberLimit: number
  requestedAt: string
}

const hashJoinRequestConvoView = 'joinRequestConvoView'

export function isJoinRequestConvoView<V>(v: V) {
  return is$typed(v, id, hashJoinRequestConvoView)
}

export function validateJoinRequestConvoView<V>(v: V) {
  return validate<JoinRequestConvoView & V>(v, id, hashJoinRequestConvoView)
}
