// @ts-nocheck
/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type HeadersMap, XRPCError } from '@atproto/xrpc'
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons.js'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util.js'
import type * as AppBskyEmbedExternal from './external.js'
import type * as ComAtprotoRepoStrongRef from '../../../com/atproto/repo/strongRef.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'app.bsky.embed.getEmbedExternalView'

export type QueryParams = {
  /** The canonical web URL the embed represents (typically the URL the user pasted into the composer). Used as the returned view's `uri`, and validated against the resolved records. */
  url: string
  /** The canonical AT URI of the atproto record found on the webpage. When provided, takes precedence over `uris`, which is then ignored. */
  canonicalUri?: string
  /** Legacy input for Standard.site callers, ignored when `canonicalUri` is provided. A single record is selected from it: the first site.standard.document URI, otherwise the first site.standard.publication URI. Other entries are ignored; a document's publication is discovered from the document itself. */
  uris?: string[]
}
export type InputSchema = undefined

export interface OutputSchema {
  view?: AppBskyEmbedExternal.View
  data?:
    | $Typed<AppBskyEmbedExternal.ViewArticle>
    | $Typed<AppBskyEmbedExternal.ViewArticlePublication>
    | $Typed<AppBskyEmbedExternal.ViewGallery>
    | $Typed<AppBskyEmbedExternal.ViewLivestream>
    | { $type: string }
  /** StrongRefs (URI+CID) of the Atmosphere records selected for persistence in a post, suitable for embedding into its external.associatedRefs: the canonical record, plus only the additional records the service chooses to persist for its collection. This can be a subset of the records used to render `data`, which may also draw on other hydrated records such as recommendations, subscriptions, or favorites. Present only when validation passed. Index-aligned with `associatedRecords`. */
  associatedRefs?: ComAtprotoRepoStrongRef.Main[]
  associatedRecords?: { [_ in string]: unknown }[]
  /** StrongRefs (URI+CID) of the same persistence-selected Atmosphere records (the canonical record plus chosen additional records) when validation of the requested `url` failed. These must not be written to a post. Index-aligned with `unverifiedAssociatedRecords`. */
  unverifiedAssociatedRefs?: ComAtprotoRepoStrongRef.Main[]
  unverifiedAssociatedRecords?: { [_ in string]: unknown }[]
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
