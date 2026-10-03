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
const id = 'com.para.community.economicActivity'

export interface Main {
  $type: 'com.para.community.economicActivity'
  communityUri: string
  title: string
  description?: string
  startsAt: string
  endsAt?: string
  location?: string
  status: 'planned' | 'active' | 'completed' | 'cancelled' | (string & {})
  details:
    $Typed<Sale> | $Typed<Raffle> | $Typed<Fundraiser> | { $type: string }
  financialPlan: FinancialPlan
  links?: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
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

export interface Sale {
  $type?: 'com.para.community.economicActivity#sale'
  items: SaleItem[]
  channel: 'in_person' | 'online' | 'mixed' | (string & {})
}

const hashSale = 'sale'

export function isSale<V>(v: V) {
  return is$typed(v, id, hashSale)
}

export function validateSale<V>(v: V) {
  return validate<Sale & V>(v, id, hashSale)
}

export interface SaleItem {
  $type?: 'com.para.community.economicActivity#saleItem'
  name: string
  unitPriceMinor: number
  quantityAvailable?: number
}

const hashSaleItem = 'saleItem'

export function isSaleItem<V>(v: V) {
  return is$typed(v, id, hashSaleItem)
}

export function validateSaleItem<V>(v: V) {
  return validate<SaleItem & V>(v, id, hashSaleItem)
}

export interface Raffle {
  $type?: 'com.para.community.economicActivity#raffle'
  ticketPriceMinor: number
  ticketsAvailable: number
  prizes: Prize[]
  drawAt: string
  drawMethod: string
  /** Authorization number for the raffle where the law requires one. */
  permitReference?: string
  /** Published after the draw; the only field of `details` excluded from the terms digest. */
  winningTickets?: string[]
}

const hashRaffle = 'raffle'

export function isRaffle<V>(v: V) {
  return is$typed(v, id, hashRaffle)
}

export function validateRaffle<V>(v: V) {
  return validate<Raffle & V>(v, id, hashRaffle)
}

export interface Prize {
  $type?: 'com.para.community.economicActivity#prize'
  description: string
  estimatedValueMinor?: number
}

const hashPrize = 'prize'

export function isPrize<V>(v: V) {
  return is$typed(v, id, hashPrize)
}

export function validatePrize<V>(v: V) {
  return validate<Prize & V>(v, id, hashPrize)
}

export interface Fundraiser {
  $type?: 'com.para.community.economicActivity#fundraiser'
  purpose: string
  beneficiary?: string
  suggestedDonationMinor?: number
  /** Public ways to give, e.g. the organization's account or a collection box location. */
  donationChannels?: string[]
}

const hashFundraiser = 'fundraiser'

export function isFundraiser<V>(v: V) {
  return is$typed(v, id, hashFundraiser)
}

export function validateFundraiser<V>(v: V) {
  return validate<Fundraiser & V>(v, id, hashFundraiser)
}

/** Where the money goes, committed before any money moves. Amounts are integers in the currency's minor unit (e.g. centavos). */
export interface FinancialPlan {
  $type?: 'com.para.community.economicActivity#financialPlan'
  currency: string
  /** Whether allocation shares apply to net proceeds (income minus expenses) or to gross income. */
  allocationBase: 'net_proceeds' | 'gross_income' | (string & {})
  fundingGoalMinor?: number
  expenseBudgetMinor?: number
  allocations: Allocation[]
  committedAt: string
}

const hashFinancialPlan = 'financialPlan'

export function isFinancialPlan<V>(v: V) {
  return is$typed(v, id, hashFinancialPlan)
}

export function validateFinancialPlan<V>(v: V) {
  return validate<FinancialPlan & V>(v, id, hashFinancialPlan)
}

export interface Allocation {
  $type?: 'com.para.community.economicActivity#allocation'
  recipient:
    | 'community'
    | 'party'
    | 'cause'
    | 'organizers'
    | 'reinvestment'
    | (string & {})
  label: string
  /** Share in basis points; all allocations must sum to 10000. */
  shareBps: number
}

const hashAllocation = 'allocation'

export function isAllocation<V>(v: V) {
  return is$typed(v, id, hashAllocation)
}

export function validateAllocation<V>(v: V) {
  return validate<Allocation & V>(v, id, hashAllocation)
}
