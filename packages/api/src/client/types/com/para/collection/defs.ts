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
const id = 'com.para.collection.defs'

export interface Collection {
  $type?: 'com.para.collection.defs#collection'
  id: string
  name: string
  description?: string
  color?: string
  items: CivicTreeItem[]
  relations?: CivicTreeRelation[]
}

const hashCollection = 'collection'

export function isCollection<V>(v: V) {
  return is$typed(v, id, hashCollection)
}

export function validateCollection<V>(v: V) {
  return validate<Collection & V>(v, id, hashCollection)
}

export interface CivicTreeItem {
  $type?: 'com.para.collection.defs#civicTreeItem'
  itemId?: string
  kind?: 'policy' | 'post' | 'link' | 'note' | 'evidence' | (string & {})
  title?: string
  description?: string
  url?: string
  sourceUri?: string
  sourceLabel?: string
  policyUri?: string
  policyCid?: string
  policyTitle?: string
  policyCategory?: string
  policyColor?: string
  note?: string
  addedAt: string
}

const hashCivicTreeItem = 'civicTreeItem'

export function isCivicTreeItem<V>(v: V) {
  return is$typed(v, id, hashCivicTreeItem)
}

export function validateCivicTreeItem<V>(v: V) {
  return validate<CivicTreeItem & V>(v, id, hashCivicTreeItem)
}

export interface CivicTreeRelation {
  $type?: 'com.para.collection.defs#civicTreeRelation'
  id: string
  fromItemId: string
  toItemId: string
  kind:
    | 'supports'
    | 'opposes'
    | 'evidence_for'
    | 'context_for'
    | 'duplicates'
    | 'depends_on'
    | 'related_to'
    | (string & {})
  note?: string
  createdAt: string
}

const hashCivicTreeRelation = 'civicTreeRelation'

export function isCivicTreeRelation<V>(v: V) {
  return is$typed(v, id, hashCivicTreeRelation)
}

export function validateCivicTreeRelation<V>(v: V) {
  return validate<CivicTreeRelation & V>(v, id, hashCivicTreeRelation)
}

export interface CollectionView {
  $type?: 'com.para.collection.defs#collectionView'
  id: string
  name: string
  description?: string
  color?: string
  items: CivicTreeItem[]
  relations?: CivicTreeRelation[]
  createdAt: string
  updatedAt: string
}

const hashCollectionView = 'collectionView'

export function isCollectionView<V>(v: V) {
  return is$typed(v, id, hashCollectionView)
}

export function validateCollectionView<V>(v: V) {
  return validate<CollectionView & V>(v, id, hashCollectionView)
}
