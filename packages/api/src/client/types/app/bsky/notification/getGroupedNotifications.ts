// @ts-nocheck
/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { HeadersMap, XRPCError } from '@atproto/xrpc'
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
const id = 'app.bsky.notification.getGroupedNotifications'

export type QueryParams = {
  /** Which notification feed to return. Grouping behavior varies by feed: notifications about follows might be grouped in 'all' and ungrouped (or rather, in single-item groups) in 'followers'. */
  feed?:
    | 'all'
    | 'people-i-follow'
    | 'conversations'
    | 'followers'
    | 'activity'
    | (string & {})
  /** Offset from UTC in minutes, positive east, used to determine local day boundaries when grouping. Groups never span the current day boundary. Defaults to UTC. */
  utcOffset?: number
  /** Maximum number of groups to return. */
  limit?: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  /** Notification groups or individual notifications, newest first. Clients should ignore kinds they do not recognize. Grouping behavior depends on the kind and selected feed. */
  groups: Group[]
  seenAt?: string
  /** A map of actor DID to app.bsky.actor.defs#profileViewDetailed. Typed dictionary values are unsupported by this lexicon version. */
  relatedProfileViews?: { [_ in string]: unknown }
  /** A map of AT URI to reusable app.bsky.feed.defs#postView, app.bsky.feed.defs#notFoundPost, app.bsky.feed.defs#blockedPost, app.bsky.graph.defs#starterPackView, or app.bsky.feed.defs#generatorView. Views shared across notifications appear once to avoid duplication. Typed dictionary values are unsupported by this lexicon version. */
  relatedRecordViews?: { [_ in string]: unknown }
}

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export function toKnownErr(e: any) {
  return e
}

/** Contains common metadata and kind-specific data for a notification group or individual notification. */
export interface Group {
  $type?: 'app.bsky.notification.getGroupedNotifications#group'
  id: string
  isRead: boolean
  indexedAt: string
  count: number
  kind:
    | $Typed<LikeGroup>
    | $Typed<MultiPostLikeGroup>
    | $Typed<RepostGroup>
    | $Typed<LikeViaRepostGroup>
    | $Typed<RepostViaRepostGroup>
    | $Typed<FollowGroup>
    | $Typed<SubscribedPostGroup>
    | $Typed<GeneratorLikeGroup>
    | $Typed<ReplyNotification>
    | $Typed<QuoteNotification>
    | $Typed<MentionNotification>
    | $Typed<FollowBackNotification>
    | $Typed<VerifiedNotification>
    | $Typed<UnverifiedNotification>
    | $Typed<StarterPackJoinedNotification>
    | $Typed<ContactMatchNotification>
    | { $type: string }
}

const hashGroup = 'group'

export function isGroup<V>(v: V) {
  return is$typed(v, id, hashGroup)
}

export function validateGroup<V>(v: V) {
  return validate<Group & V>(v, id, hashGroup)
}

/** Group of likes by different actors on the same post. */
export interface LikeGroup {
  $type?: 'app.bsky.notification.getGroupedNotifications#likeGroup'
  post: string
  items: LikeItem[]
}

const hashLikeGroup = 'likeGroup'

export function isLikeGroup<V>(v: V) {
  return is$typed(v, id, hashLikeGroup)
}

export function validateLikeGroup<V>(v: V) {
  return validate<LikeGroup & V>(v, id, hashLikeGroup)
}

/** One actor who liked the group's post. */
export interface LikeItem {
  $type?: 'app.bsky.notification.getGroupedNotifications#likeItem'
  actor: string
}

const hashLikeItem = 'likeItem'

export function isLikeItem<V>(v: V) {
  return is$typed(v, id, hashLikeItem)
}

export function validateLikeItem<V>(v: V) {
  return validate<LikeItem & V>(v, id, hashLikeItem)
}

/** Group of likes by the same actor on different posts. */
export interface MultiPostLikeGroup {
  $type?: 'app.bsky.notification.getGroupedNotifications#multiPostLikeGroup'
  actor: string
  items: MultiPostLikeItem[]
}

const hashMultiPostLikeGroup = 'multiPostLikeGroup'

export function isMultiPostLikeGroup<V>(v: V) {
  return is$typed(v, id, hashMultiPostLikeGroup)
}

export function validateMultiPostLikeGroup<V>(v: V) {
  return validate<MultiPostLikeGroup & V>(v, id, hashMultiPostLikeGroup)
}

/** One post which was liked by the group's actor. */
export interface MultiPostLikeItem {
  $type?: 'app.bsky.notification.getGroupedNotifications#multiPostLikeItem'
  post: string
}

const hashMultiPostLikeItem = 'multiPostLikeItem'

export function isMultiPostLikeItem<V>(v: V) {
  return is$typed(v, id, hashMultiPostLikeItem)
}

export function validateMultiPostLikeItem<V>(v: V) {
  return validate<MultiPostLikeItem & V>(v, id, hashMultiPostLikeItem)
}

/** Group of reposts by different actors of the same post. */
export interface RepostGroup {
  $type?: 'app.bsky.notification.getGroupedNotifications#repostGroup'
  post: string
  items: RepostItem[]
}

const hashRepostGroup = 'repostGroup'

export function isRepostGroup<V>(v: V) {
  return is$typed(v, id, hashRepostGroup)
}

export function validateRepostGroup<V>(v: V) {
  return validate<RepostGroup & V>(v, id, hashRepostGroup)
}

/** One actor who reposted the group's post. */
export interface RepostItem {
  $type?: 'app.bsky.notification.getGroupedNotifications#repostItem'
  actor: string
}

const hashRepostItem = 'repostItem'

export function isRepostItem<V>(v: V) {
  return is$typed(v, id, hashRepostItem)
}

export function validateRepostItem<V>(v: V) {
  return validate<RepostItem & V>(v, id, hashRepostItem)
}

/** Group of likes by different actors on the same post via the requesting account's repost. */
export interface LikeViaRepostGroup {
  $type?: 'app.bsky.notification.getGroupedNotifications#likeViaRepostGroup'
  post: string
  viaRepost: string
  items: LikeViaRepostItem[]
}

const hashLikeViaRepostGroup = 'likeViaRepostGroup'

export function isLikeViaRepostGroup<V>(v: V) {
  return is$typed(v, id, hashLikeViaRepostGroup)
}

export function validateLikeViaRepostGroup<V>(v: V) {
  return validate<LikeViaRepostGroup & V>(v, id, hashLikeViaRepostGroup)
}

/** One actor who liked the group's post via the requesting account's repost. */
export interface LikeViaRepostItem {
  $type?: 'app.bsky.notification.getGroupedNotifications#likeViaRepostItem'
  actor: string
}

const hashLikeViaRepostItem = 'likeViaRepostItem'

export function isLikeViaRepostItem<V>(v: V) {
  return is$typed(v, id, hashLikeViaRepostItem)
}

export function validateLikeViaRepostItem<V>(v: V) {
  return validate<LikeViaRepostItem & V>(v, id, hashLikeViaRepostItem)
}

/** Group of reposts by different actors of the same post via the requesting account's repost. */
export interface RepostViaRepostGroup {
  $type?: 'app.bsky.notification.getGroupedNotifications#repostViaRepostGroup'
  post: string
  viaRepost: string
  items: RepostViaRepostItem[]
}

const hashRepostViaRepostGroup = 'repostViaRepostGroup'

export function isRepostViaRepostGroup<V>(v: V) {
  return is$typed(v, id, hashRepostViaRepostGroup)
}

export function validateRepostViaRepostGroup<V>(v: V) {
  return validate<RepostViaRepostGroup & V>(v, id, hashRepostViaRepostGroup)
}

/** One actor who reposted the group's post via the requesting account's repost. */
export interface RepostViaRepostItem {
  $type?: 'app.bsky.notification.getGroupedNotifications#repostViaRepostItem'
  actor: string
}

const hashRepostViaRepostItem = 'repostViaRepostItem'

export function isRepostViaRepostItem<V>(v: V) {
  return is$typed(v, id, hashRepostViaRepostItem)
}

export function validateRepostViaRepostItem<V>(v: V) {
  return validate<RepostViaRepostItem & V>(v, id, hashRepostViaRepostItem)
}

/** Group of actors who followed the requesting account. */
export interface FollowGroup {
  $type?: 'app.bsky.notification.getGroupedNotifications#followGroup'
  items: FollowItem[]
}

const hashFollowGroup = 'followGroup'

export function isFollowGroup<V>(v: V) {
  return is$typed(v, id, hashFollowGroup)
}

export function validateFollowGroup<V>(v: V) {
  return validate<FollowGroup & V>(v, id, hashFollowGroup)
}

/** An actor who followed the requesting account, possibly via a starter pack. */
export interface FollowItem {
  $type?: 'app.bsky.notification.getGroupedNotifications#followItem'
  actor: string
  starterPack?: string
}

const hashFollowItem = 'followItem'

export function isFollowItem<V>(v: V) {
  return is$typed(v, id, hashFollowItem)
}

export function validateFollowItem<V>(v: V) {
  return validate<FollowItem & V>(v, id, hashFollowItem)
}

/** Group of new posts by actors the requesting account subscribes to. */
export interface SubscribedPostGroup {
  $type?: 'app.bsky.notification.getGroupedNotifications#subscribedPostGroup'
  items: SubscribedPostItem[]
}

const hashSubscribedPostGroup = 'subscribedPostGroup'

export function isSubscribedPostGroup<V>(v: V) {
  return is$typed(v, id, hashSubscribedPostGroup)
}

export function validateSubscribedPostGroup<V>(v: V) {
  return validate<SubscribedPostGroup & V>(v, id, hashSubscribedPostGroup)
}

/** One new post by an actor the requesting account subscribes to. */
export interface SubscribedPostItem {
  $type?: 'app.bsky.notification.getGroupedNotifications#subscribedPostItem'
  actor: string
  post: string
}

const hashSubscribedPostItem = 'subscribedPostItem'

export function isSubscribedPostItem<V>(v: V) {
  return is$typed(v, id, hashSubscribedPostItem)
}

export function validateSubscribedPostItem<V>(v: V) {
  return validate<SubscribedPostItem & V>(v, id, hashSubscribedPostItem)
}

/** Group of likes by different actors on the same feed generator. */
export interface GeneratorLikeGroup {
  $type?: 'app.bsky.notification.getGroupedNotifications#generatorLikeGroup'
  generator: string
  items: GeneratorLikeItem[]
}

const hashGeneratorLikeGroup = 'generatorLikeGroup'

export function isGeneratorLikeGroup<V>(v: V) {
  return is$typed(v, id, hashGeneratorLikeGroup)
}

export function validateGeneratorLikeGroup<V>(v: V) {
  return validate<GeneratorLikeGroup & V>(v, id, hashGeneratorLikeGroup)
}

/** One actor who liked the feed generator in the group. */
export interface GeneratorLikeItem {
  $type?: 'app.bsky.notification.getGroupedNotifications#generatorLikeItem'
  actor: string
}

const hashGeneratorLikeItem = 'generatorLikeItem'

export function isGeneratorLikeItem<V>(v: V) {
  return is$typed(v, id, hashGeneratorLikeItem)
}

export function validateGeneratorLikeItem<V>(v: V) {
  return validate<GeneratorLikeItem & V>(v, id, hashGeneratorLikeItem)
}

/** A reply to a post by the requesting account or to a thread they are participating in. */
export interface ReplyNotification {
  $type?: 'app.bsky.notification.getGroupedNotifications#replyNotification'
  post: string
  parent: string
}

const hashReplyNotification = 'replyNotification'

export function isReplyNotification<V>(v: V) {
  return is$typed(v, id, hashReplyNotification)
}

export function validateReplyNotification<V>(v: V) {
  return validate<ReplyNotification & V>(v, id, hashReplyNotification)
}

/** A post quoting a post by the requesting account. */
export interface QuoteNotification {
  $type?: 'app.bsky.notification.getGroupedNotifications#quoteNotification'
  post: string
  parent?: string
}

const hashQuoteNotification = 'quoteNotification'

export function isQuoteNotification<V>(v: V) {
  return is$typed(v, id, hashQuoteNotification)
}

export function validateQuoteNotification<V>(v: V) {
  return validate<QuoteNotification & V>(v, id, hashQuoteNotification)
}

/** A post mentioning the requesting account. */
export interface MentionNotification {
  $type?: 'app.bsky.notification.getGroupedNotifications#mentionNotification'
  post: string
  parent?: string
}

const hashMentionNotification = 'mentionNotification'

export function isMentionNotification<V>(v: V) {
  return is$typed(v, id, hashMentionNotification)
}

export function validateMentionNotification<V>(v: V) {
  return validate<MentionNotification & V>(v, id, hashMentionNotification)
}

/** An actor followed the requesting account back, possibly via a starter pack. */
export interface FollowBackNotification {
  $type?: 'app.bsky.notification.getGroupedNotifications#followBackNotification'
  actor: string
  starterPack?: string
}

const hashFollowBackNotification = 'followBackNotification'

export function isFollowBackNotification<V>(v: V) {
  return is$typed(v, id, hashFollowBackNotification)
}

export function validateFollowBackNotification<V>(v: V) {
  return validate<FollowBackNotification & V>(v, id, hashFollowBackNotification)
}

/** An actor verified the requesting account. */
export interface VerifiedNotification {
  $type?: 'app.bsky.notification.getGroupedNotifications#verifiedNotification'
  actor: string
}

const hashVerifiedNotification = 'verifiedNotification'

export function isVerifiedNotification<V>(v: V) {
  return is$typed(v, id, hashVerifiedNotification)
}

export function validateVerifiedNotification<V>(v: V) {
  return validate<VerifiedNotification & V>(v, id, hashVerifiedNotification)
}

/** A verification of the requesting account was removed. */
export interface UnverifiedNotification {
  $type?: 'app.bsky.notification.getGroupedNotifications#unverifiedNotification'
  actor: string
}

const hashUnverifiedNotification = 'unverifiedNotification'

export function isUnverifiedNotification<V>(v: V) {
  return is$typed(v, id, hashUnverifiedNotification)
}

export function validateUnverifiedNotification<V>(v: V) {
  return validate<UnverifiedNotification & V>(v, id, hashUnverifiedNotification)
}

/** An actor joined Bluesky via a starter pack created by the requesting account. */
export interface StarterPackJoinedNotification {
  $type?: 'app.bsky.notification.getGroupedNotifications#starterPackJoinedNotification'
  actor: string
  starterPack: string
}

const hashStarterPackJoinedNotification = 'starterPackJoinedNotification'

export function isStarterPackJoinedNotification<V>(v: V) {
  return is$typed(v, id, hashStarterPackJoinedNotification)
}

export function validateStarterPackJoinedNotification<V>(v: V) {
  return validate<StarterPackJoinedNotification & V>(
    v,
    id,
    hashStarterPackJoinedNotification,
  )
}

/** A contact of the requesting account joined Bluesky. */
export interface ContactMatchNotification {
  $type?: 'app.bsky.notification.getGroupedNotifications#contactMatchNotification'
  actor: string
}

const hashContactMatchNotification = 'contactMatchNotification'

export function isContactMatchNotification<V>(v: V) {
  return is$typed(v, id, hashContactMatchNotification)
}

export function validateContactMatchNotification<V>(v: V) {
  return validate<ContactMatchNotification & V>(
    v,
    id,
    hashContactMatchNotification,
  )
}
