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
import type * as ComParaCollectionDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.collection.record'

export interface Main {
  $type: 'com.para.collection.record'
  name: string
  description?: string
  color?: string
  items: ComParaCollectionDefs.CivicTreeItem[]
  relations?: ComParaCollectionDefs.CivicTreeRelation[]
  createdAt: string
  updatedAt?: string
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
