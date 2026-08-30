// @ts-nocheck
/**
 * GENERATED CODE - DO NOT MODIFY
 */
import stream from 'node:stream'
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
const id = 'com.atproto.space.getRepo'

export type QueryParams = {
  /** Reference to the space. */
  space: string
  /** The DID of the account whose repo to download. */
  repo: string
  /** If true, omit the record blocks and return only the commit and index roots. The index is still fully authenticated by folding its entries into a set hash and comparing against the commit, so a syncer can diff it against a local copy and fetch just the records it lacks. Note the resulting CAR declares two roots and carries no non-root blocks. */
  excludeValues: boolean
}
export type InputSchema = undefined
export type HandlerInput = void

export interface HandlerSuccess {
  encoding: 'application/vnd.ipld.car'
  body: Uint8Array | stream.Readable
  headers?: { [key: string]: string }
}

export interface HandlerError {
  status: number
  message?: string
  error?:
    | 'SpaceNotFound'
    | 'RepoNotFound'
    | 'RepoTakendown'
    | 'RepoSuspended'
    | 'RepoDeactivated'
}

export type HandlerOutput = HandlerError | HandlerSuccess
