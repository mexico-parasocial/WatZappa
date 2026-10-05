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
  /** What the item is. All kinds except `topic` reference an artifact with a URI or URL; a `topic` is a subject the artifacts are about, and carries no target of its own. A `book` is a private reading entry: `title` is the book and `sourceLabel` its author. */
  kind?:
    | 'policy'
    | 'post'
    | 'link'
    | 'note'
    | 'evidence'
    | 'topic'
    | 'book'
    | (string & {})
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
  /** For a topic drawn from PARA's shared flair vocabulary, the flair id. Absent on a free-text topic. */
  flairId?: string
  /** For a `book`, the year it was first published. */
  publishedYear?: number
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

/** Fields to change on an existing item. Only the fields present are changed. To clear an optional field, send an empty string. */
export interface ItemPatch {
  $type?: 'com.para.collection.defs#itemPatch'
  /** What the item is. All kinds except `topic` reference an artifact with a URI or URL; a `topic` is a subject the artifacts are about, and carries no target of its own. A `book` is a private reading entry: `title` is the book and `sourceLabel` its author. */
  kind?:
    | 'policy'
    | 'post'
    | 'link'
    | 'note'
    | 'evidence'
    | 'topic'
    | 'book'
    | (string & {})
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
  /** For a topic drawn from PARA's shared flair vocabulary, the flair id. Absent on a free-text topic. */
  flairId?: string
  /** For a `book`, the year it was first published. */
  publishedYear?: number
}

const hashItemPatch = 'itemPatch'

export function isItemPatch<V>(v: V) {
  return is$typed(v, id, hashItemPatch)
}

export function validateItemPatch<V>(v: V) {
  return validate<ItemPatch & V>(v, id, hashItemPatch)
}

/** Changes to a collection's own fields. Only the fields present are changed; an empty description clears it. */
export interface DetailsPatch {
  $type?: 'com.para.collection.defs#detailsPatch'
  name?: string
  description?: string
  color?: string
}

const hashDetailsPatch = 'detailsPatch'

export function isDetailsPatch<V>(v: V) {
  return is$typed(v, id, hashDetailsPatch)
}

export function validateDetailsPatch<V>(v: V) {
  return validate<DetailsPatch & V>(v, id, hashDetailsPatch)
}

/** One edit to a collection. `type` selects which of the other fields apply: addItem(item), updateItem(itemKey, patch), removeItem(itemKey), addRelation(relation), removeRelation(relationId), updateDetails(fields). */
export interface CollectionOp {
  $type?: 'com.para.collection.defs#collectionOp'
  type:
    | 'addItem'
    | 'updateItem'
    | 'removeItem'
    | 'addRelation'
    | 'removeRelation'
    | 'updateDetails'
    | (string & {})
  item?: CivicTreeItem
  itemKey?: string
  patch?: ItemPatch
  relation?: CivicTreeRelation
  relationId?: string
  fields?: DetailsPatch
}

const hashCollectionOp = 'collectionOp'

export function isCollectionOp<V>(v: V) {
  return is$typed(v, id, hashCollectionOp)
}

export function validateCollectionOp<V>(v: V) {
  return validate<CollectionOp & V>(v, id, hashCollectionOp)
}

/** A batch of edits to one collection, as stored in the operation log. The appview applies these in log order to the collection's current state. */
export interface CollectionOps {
  $type?: 'com.para.collection.defs#collectionOps'
  collection: string
  ops: CollectionOp[]
  createdAt: string
}

const hashCollectionOps = 'collectionOps'

export function isCollectionOps<V>(v: V) {
  return is$typed(v, id, hashCollectionOps)
}

export function validateCollectionOps<V>(v: V) {
  return validate<CollectionOps & V>(v, id, hashCollectionOps)
}
