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
const id = 'com.para.community.listWikiPages'

export type QueryParams = {
  community: string
  kind?: 'page' | 'megathread' | (string & {})
}
export type InputSchema = undefined

export interface OutputSchema {
  pages: WikiPageView[]
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

export interface WikiPageView {
  $type?: 'com.para.community.listWikiPages#wikiPageView'
  uri: string
  cid: string
  author: string
  /** The com.para.community.wikiPage record. */
  record: { [_ in string]: unknown }
  indexedAt: string
}

const hashWikiPageView = 'wikiPageView'

export function isWikiPageView<V>(v: V) {
  return is$typed(v, id, hashWikiPageView)
}

export function validateWikiPageView<V>(v: V) {
  return validate<WikiPageView & V>(v, id, hashWikiPageView)
}
