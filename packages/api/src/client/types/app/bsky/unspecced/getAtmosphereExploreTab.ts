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
import type * as AppBskyEmbedExternal from '../embed/external.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'app.bsky.unspecced.getAtmosphereExploreTab'

export type QueryParams = {
  /** Preferred languages. Currently ignored. */
  langs?: string[]
  /** The ISO 3166-1 alpha-2 country code used to select curated content. */
  countryCode?: string
  /** The ISO 3166-2 region code used to select curated content. */
  regionCode?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  announcementBanner?: AnnouncementBanner
  articles: ArticleItem[]
  publications: PublicationItem[]
  photos: GalleryItem[]
  livestreams: LivestreamItem[]
  apps: AppCard[]
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

export interface ArticleItem {
  $type?: 'app.bsky.unspecced.getAtmosphereExploreTab#articleItem'
  featured: boolean
  view: AppBskyEmbedExternal.ViewArticle
}

const hashArticleItem = 'articleItem'

export function isArticleItem<V>(v: V) {
  return is$typed(v, id, hashArticleItem)
}

export function validateArticleItem<V>(v: V) {
  return validate<ArticleItem & V>(v, id, hashArticleItem)
}

export interface PublicationItem {
  $type?: 'app.bsky.unspecced.getAtmosphereExploreTab#publicationItem'
  featured: boolean
  view: AppBskyEmbedExternal.ViewArticlePublication
}

const hashPublicationItem = 'publicationItem'

export function isPublicationItem<V>(v: V) {
  return is$typed(v, id, hashPublicationItem)
}

export function validatePublicationItem<V>(v: V) {
  return validate<PublicationItem & V>(v, id, hashPublicationItem)
}

export interface GalleryItem {
  $type?: 'app.bsky.unspecced.getAtmosphereExploreTab#galleryItem'
  featured: boolean
  view: AppBskyEmbedExternal.ViewGallery
}

const hashGalleryItem = 'galleryItem'

export function isGalleryItem<V>(v: V) {
  return is$typed(v, id, hashGalleryItem)
}

export function validateGalleryItem<V>(v: V) {
  return validate<GalleryItem & V>(v, id, hashGalleryItem)
}

export interface LivestreamItem {
  $type?: 'app.bsky.unspecced.getAtmosphereExploreTab#livestreamItem'
  featured: boolean
  view: AppBskyEmbedExternal.ViewLivestream
}

const hashLivestreamItem = 'livestreamItem'

export function isLivestreamItem<V>(v: V) {
  return is$typed(v, id, hashLivestreamItem)
}

export function validateLivestreamItem<V>(v: V) {
  return validate<LivestreamItem & V>(v, id, hashLivestreamItem)
}

export interface AnnouncementBanner {
  $type?: 'app.bsky.unspecced.getAtmosphereExploreTab#announcementBanner'
  id?: string
  title?: string
  description?: string
  url?: string
  image?: string
  overlayColor?: string
  textColor?: string
}

const hashAnnouncementBanner = 'announcementBanner'

export function isAnnouncementBanner<V>(v: V) {
  return is$typed(v, id, hashAnnouncementBanner)
}

export function validateAnnouncementBanner<V>(v: V) {
  return validate<AnnouncementBanner & V>(v, id, hashAnnouncementBanner)
}

export interface AppCard {
  $type?: 'app.bsky.unspecced.getAtmosphereExploreTab#appCard'
  id?: string
  title?: string
  description?: string
  logo?: string
  backgroundImage?: string
  overlayColor?: string
  textColor?: string
  url?: string
  category?: string
}

const hashAppCard = 'appCard'

export function isAppCard<V>(v: V) {
  return is$typed(v, id, hashAppCard)
}

export function validateAppCard<V>(v: V) {
  return validate<AppCard & V>(v, id, hashAppCard)
}
