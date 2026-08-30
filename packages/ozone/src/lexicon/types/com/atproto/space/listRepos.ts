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
const id = 'com.atproto.space.listRepos'

export type QueryParams = {
  /** Reference to the space. */
  space: string
  /** Maximum number of repos to return. */
  limit: number
  cursor?: string
}
export type InputSchema = undefined

export interface OutputSchema {
  cursor?: string
  repos: Repo[]
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
  error?: 'SpaceNotFound'
}

export type HandlerOutput = HandlerError | HandlerSuccess

export interface Repo {
  $type?: 'com.atproto.space.listRepos#repo'
  /** The DID of a repo that holds data in the space. */
  did: string
  /** The repo's current revision (TID), as last reported to the authority. May lag the repo host, which is the source of truth. */
  rev: string
  /** The repo's current commit hash (sha256 of the LtHash state), as last reported to the authority. */
  hash: Uint8Array
}

const hashRepo = 'repo'

export function isRepo<V>(v: V) {
  return is$typed(v, id, hashRepo)
}

export function validateRepo<V>(v: V) {
  return validate<Repo & V>(v, id, hashRepo)
}
