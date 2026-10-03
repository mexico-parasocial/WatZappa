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
const id = 'com.para.community.activityLedgerEntry'

export interface Main {
  $type: 'com.para.community.activityLedgerEntry'
  /** The com.para.community.economicActivity this entry belongs to. */
  activityUri: string
  communityUri: string
  /** sha256 hex of the activity's committed terms (financialPlan plus pricing details) when the entry was booked. */
  termsDigest: string
  /** income: money received; expense: money spent running the activity; donation: proceeds delivered to an allocation recipient. */
  entryType: 'income' | 'expense' | 'donation' | (string & {})
  amountMinor: number
  /** Units or tickets this income entry covers, when applicable. */
  quantity?: number
  currency: string
  description: string
  category?:
    | 'materials'
    | 'permits'
    | 'transport'
    | 'venue'
    | 'prizes'
    | 'fees'
    | 'sales'
    | 'tickets'
    | 'other'
    | (string & {})
  /** For donation entries: the allocation recipient that received the funds. */
  recipient?: string
  receiptUrl?: string
  occurredAt: string
  createdAt: string
  /** For sale income: which item was sold. */
  itemName?: string
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
