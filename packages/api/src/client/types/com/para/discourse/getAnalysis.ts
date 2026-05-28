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
const id = 'com.para.discourse.getAnalysis'

export type QueryParams = {
  /** The Cabildeo or Community to analyze. */
  subject: string
  timeframe?: '1h' | '24h' | '7d' | '30d' | 'all'
}
export type InputSchema = undefined

export interface OutputSchema {
  subject: string
  aspects: AspectAnalysis[]
  summary?: string
  computedAt: string
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

export interface SentimentDistribution {
  $type?: 'com.para.discourse.getAnalysis#sentimentDistribution'
  /** Percentage (0-100) */
  strongPositive: number
  /** Percentage (0-100) */
  positive: number
  /** Percentage (0-100) */
  neutral: number
  /** Percentage (0-100) */
  negative: number
  /** Percentage (0-100) */
  strongNegative: number
}

const hashSentimentDistribution = 'sentimentDistribution'

export function isSentimentDistribution<V>(v: V) {
  return is$typed(v, id, hashSentimentDistribution)
}

export function validateSentimentDistribution<V>(v: V) {
  return validate<SentimentDistribution & V>(v, id, hashSentimentDistribution)
}

export interface AspectAnalysis {
  $type?: 'com.para.discourse.getAnalysis#aspectAnalysis'
  /** The specific feature or topic extracted (e.g., 'Costo de Obra', 'Impacto Ambiental'). */
  label: string
  /** Total occurrences in the discourse. */
  count: number
  sentiment: SentimentDistribution
  /** Model confidence score for this aspect extraction. */
  confidence: number
  /** How unified the community is on this specific aspect. */
  consensusScore: number
  summary?: string
  sampleQuotes?: string[]
}

const hashAspectAnalysis = 'aspectAnalysis'

export function isAspectAnalysis<V>(v: V) {
  return is$typed(v, id, hashAspectAnalysis)
}

export function validateAspectAnalysis<V>(v: V) {
  return validate<AspectAnalysis & V>(v, id, hashAspectAnalysis)
}
