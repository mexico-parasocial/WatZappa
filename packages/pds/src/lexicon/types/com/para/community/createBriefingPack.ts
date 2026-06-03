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
import type * as ComParaCommunityDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'com.para.community.createBriefingPack'

export type QueryParams = {}

export interface InputSchema {
  packType: 'party_lobbying'
  communityUri: string
  party: string
  title: string
  summary: string
  cabildeoUris?: string[]
  civicTreeCardIds?: string[]
  evidenceUris?: string[]
  sembleCollectionUri?: string
  marginCollectionUri?: string
  obsidianExportUri?: string
}

export interface OutputSchema {
  pack: ComParaCommunityDefs.BriefingPackView
}

export interface HandlerInput {
  encoding: 'application/json'
  body: InputSchema
}

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
