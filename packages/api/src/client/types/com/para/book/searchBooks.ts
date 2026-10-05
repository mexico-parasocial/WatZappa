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
const id = 'com.para.book.searchBooks'

export type QueryParams = {
  /** Partial title and/or author. */
  q: string
  limit?: number
}
export type InputSchema = undefined

export interface OutputSchema {
  books: BookSuggestion[]
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

export interface BookSuggestion {
  $type?: 'com.para.book.searchBooks#bookSuggestion'
  /** Open Library work key, e.g. /works/OL123W. */
  key: string
  title: string
  authors: string[]
  /** Year the work was first published, when known. */
  firstPublishYear?: number
}

const hashBookSuggestion = 'bookSuggestion'

export function isBookSuggestion<V>(v: V) {
  return is$typed(v, id, hashBookSuggestion)
}

export function validateBookSuggestion<V>(v: V) {
  return validate<BookSuggestion & V>(v, id, hashBookSuggestion)
}
