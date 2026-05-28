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
const id = 'com.para.highlight.defs'

export interface HighlightView {
  $type?: 'com.para.highlight.defs#highlightView'
  uri: string
  cid: CID
  creator: string
  indexedAt: string
  subjectUri: string
  subjectCid?: string
  text: string
  start: number
  end: number
  color: string
  tag?: string
  community?: string
  state?: string
  party?: string
  visibility: 'public' | 'private' | (string & {})
  createdAt: string
}

const hashHighlightView = 'highlightView'

export function isHighlightView<V>(v: V) {
  return is$typed(v, id, hashHighlightView)
}

export function validateHighlightView<V>(v: V) {
  return validate<HighlightView & V>(v, id, hashHighlightView)
}
