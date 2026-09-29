import { Cid, LexMap, TypedBlobRef } from '@atproto/lex-data'
import { BlockMap, CommitData, WriteOpAction } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'

export type ValidationStatus = 'valid' | 'unknown'

export type PreparedCreate = {
  action: WriteOpAction.Create
  uri: AtUri
  cid: Cid
  swapCid?: Cid | null
  record: LexMap
  blobs: TypedBlobRef[]
  validationStatus?: ValidationStatus
}

export type PreparedUpdate = {
  action: WriteOpAction.Update
  uri: AtUri
  cid: Cid
  swapCid?: Cid | null
  record: LexMap
  blobs: TypedBlobRef[]
  validationStatus?: ValidationStatus
}

export type PreparedDelete = {
  action: WriteOpAction.Delete
  uri: AtUri
  swapCid?: Cid | null
}

export type CommitOp = {
  action: 'create' | 'update' | 'delete'
  path: string
  cid: Cid | null
  prev?: Cid
}

export type CommitDataWithOps = CommitData & {
  ops: CommitOp[]
  prevData: Cid | null
}

export type PreparedWrite = PreparedCreate | PreparedUpdate | PreparedDelete

export type SyncEvtData = {
  cid: Cid
  rev: string
  blocks: BlockMap
}

export class InvalidRecordError extends Error {}

/**
 * A write refused by the PARA ballot policy. Subclasses
 * {@link InvalidRecordError} so that every handler already mapping that to a
 * 400 refuses the write without a per-handler change.
 */
export class BallotRefusedError extends InvalidRecordError {
  name = 'BallotRefusedError'
}

/**
 * A write refused because PARA does not support its record type (e.g.
 * reposts). Subclasses {@link InvalidRecordError} so every handler maps it to
 * a 400 without a per-handler change.
 */
export class UnsupportedRecordError extends InvalidRecordError {
  name = 'UnsupportedRecordError'
}

export class BadCommitSwapError extends Error {
  constructor(public cid: Cid) {
    super(`Commit was at ${cid.toString()}`)
  }
}

export class BadRecordSwapError extends Error {
  constructor(public cid: Cid | null) {
    super(`Record was at ${cid?.toString() ?? 'null'}`)
  }
}
