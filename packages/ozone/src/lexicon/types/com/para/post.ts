/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../util.js'
import type * as AppBskyRichtextFacet from '../../app/bsky/richtext/facet.js'
import type * as AppBskyEmbedImages from '../../app/bsky/embed/images.js'
import type * as AppBskyEmbedVideo from '../../app/bsky/embed/video.js'
import type * as AppBskyEmbedExternal from '../../app/bsky/embed/external.js'
import type * as AppBskyEmbedRecord from '../../app/bsky/embed/record.js'
import type * as AppBskyEmbedRecordWithMedia from '../../app/bsky/embed/recordWithMedia.js'
import type * as ComAtprotoLabelDefs from '../atproto/label/defs.js'
import type * as ComAtprotoRepoStrongRef from '../atproto/repo/strongRef.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.post'

export interface Main {
  $type: 'com.para.post'
  /** The primary post content. May be an empty string, if there are embeds. */
  text: string
  /** DEPRECATED: replaced by app.bsky.richtext.facet. */
  entities?: Entity[]
  /** Annotations of text (mentions, URLs, hashtags, etc) */
  facets?: AppBskyRichtextFacet.Main[]
  reply?: ReplyRef
  embed?:
    | $Typed<AppBskyEmbedImages.Main>
    | $Typed<AppBskyEmbedVideo.Main>
    | $Typed<AppBskyEmbedExternal.Main>
    | $Typed<AppBskyEmbedRecord.Main>
    | $Typed<AppBskyEmbedRecordWithMedia.Main>
    | { $type: string }
  /** Indicates human language of post primary text content. */
  langs?: string[]
  labels?: $Typed<ComAtprotoLabelDefs.SelfLabels> | { $type: string }
  /** Additional hashtags, in addition to any included in post text and facets. */
  tags?: string[]
  /** Optional para-specific flairs associated with the post. */
  flairs?: string[]
  /** Optional para-specific post type (policy, matter, meme, etc). */
  postType?: string
  /** Optional title for policy or proposal posts, summarizing the content. */
  title?: string
  /** Client-declared timestamp when this post was originally created. */
  createdAt: string
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

export interface ReplyRef {
  $type?: 'com.para.post#replyRef'
  root: ComAtprotoRepoStrongRef.Main
  parent: ComAtprotoRepoStrongRef.Main
}

const hashReplyRef = 'replyRef'

export function isReplyRef<V>(v: V) {
  return is$typed(v, id, hashReplyRef)
}

export function validateReplyRef<V>(v: V) {
  return validate<ReplyRef & V>(v, id, hashReplyRef)
}

/** Deprecated: use facets instead. */
export interface Entity {
  $type?: 'com.para.post#entity'
  index: TextSlice
  /** Expected values are 'mention' and 'link'. */
  type: string
  value: string
}

const hashEntity = 'entity'

export function isEntity<V>(v: V) {
  return is$typed(v, id, hashEntity)
}

export function validateEntity<V>(v: V) {
  return validate<Entity & V>(v, id, hashEntity)
}

/** Deprecated. Use app.bsky.richtext instead -- A text segment. Start is inclusive, end is exclusive. Indices are for utf16-encoded strings. */
export interface TextSlice {
  $type?: 'com.para.post#textSlice'
  start: number
  end: number
}

const hashTextSlice = 'textSlice'

export function isTextSlice<V>(v: V) {
  return is$typed(v, id, hashTextSlice)
}

export function validateTextSlice<V>(v: V) {
  return validate<TextSlice & V>(v, id, hashTextSlice)
}
