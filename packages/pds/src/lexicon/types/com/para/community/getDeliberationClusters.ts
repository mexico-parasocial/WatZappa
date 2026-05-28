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
const id = 'com.para.community.getDeliberationClusters'

export type QueryParams = {
  proposal: string
}
export type InputSchema = undefined

export interface OutputSchema {
  clusters: ClusterView[]
  bridging: StatementView[]
}

export type HandlerInput = void

export interface HandlerSuccess {
  encoding: 'application/json'
  body: OutputSchema
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
}

export type HandlerOutput = HandlerError | HandlerSuccess

export interface ClusterView {
  $type?: 'com.para.community.getDeliberationClusters#clusterView'
  stance: string
  statementCount: number
  totalAgree: number
  totalDisagree: number
  totalPass: number
}

const hashClusterView = 'clusterView'

export function isClusterView<V>(v: V) {
  return is$typed(v, id, hashClusterView)
}

export function validateClusterView<V>(v: V) {
  return validate<ClusterView & V>(v, id, hashClusterView)
}

export interface StatementView {
  $type?: 'com.para.community.getDeliberationClusters#statementView'
  uri: string
  body: string
  agreeCount: number
  disagreeCount: number
  passCount: number
}

const hashStatementView = 'statementView'

export function isStatementView<V>(v: V) {
  return is$typed(v, id, hashStatementView)
}

export function validateStatementView<V>(v: V) {
  return validate<StatementView & V>(v, id, hashStatementView)
}
