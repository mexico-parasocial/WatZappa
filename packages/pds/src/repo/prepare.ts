import {
  TID,
  ballotWriteRefusal,
  reactionWriteRefusal,
  repostWriteRefusal,
  verifyCabildeoDelegation,
  verifyCabildeoProof,
} from '@atproto/common'
import { RecordSchema, walk } from '@atproto/lex'
import { encode } from '@atproto/lex-cbor'
import {
  type Cid,
  type LexMap,
  type TypedBlobRef,
  type TypedLexMap,
  cidForCbor,
  enumBlobRefs,
  isLegacyBlobRef,
} from '@atproto/lex-data'
import {
  type RecordCreateOp,
  type RecordDeleteOp,
  type RecordUpdateOp,
  type RecordWriteOp,
  WriteOpAction,
} from '@atproto/repo'
import {
  AtUri,
  type DidString,
  type NsidString,
  type RecordKeyString,
  isValidRecordKey,
} from '@atproto/syntax'
import { hasExplicitSlur } from '../handle/explicit-slurs.js'
import * as lexicons from '../lexicons/index.js'
import {
  BallotRefusedError,
  InvalidRecordError,
  type PreparedCreate,
  type PreparedDelete,
  type PreparedUpdate,
  type PreparedWrite,
  UnsupportedRecordError,
  type ValidationStatus,
} from './types.js'

const knownSchemas = new Map<string, RecordSchema>(
  walk(lexicons)
    .filter((s) => s instanceof RecordSchema)
    .map((s) => [s.$type, s]),
)

const validateRecord = (
  record: TypedLexMap,
  rkey: RecordKeyString,
  opts: {
    validate?: boolean
    validationPath?: (string | number)[]
  },
): undefined | ValidationStatus => {
  // If validation is explicitly disabled, skip it
  if (opts.validate === false) {
    return undefined
  }

  // @TODO add support for lexicon resolution to fetch the schema dynamically
  const schema = knownSchemas.get(record.$type)
  if (!schema) {
    // If validation is explicitly requested, throw if unable to validate
    if (opts.validate === true) {
      throw new InvalidRecordError(`Unknown lexicon type: ${record.$type}`)
    } else {
      return 'unknown'
    }
  }

  const rkeyResult = schema.keySchema.safeValidate(rkey)
  if (!rkeyResult.success) {
    throw new InvalidRecordError(
      `Invalid record key for ${record.$type}: ${rkeyResult.reason.message}`,
      { cause: rkeyResult.reason },
    )
  }

  const recordResult = schema.safeValidate(record, {
    path: opts.validationPath ?? ['record'],
  })
  if (!recordResult.success) {
    throw new InvalidRecordError(
      `Invalid ${record.$type} record: ${recordResult.reason.message}`,
      { cause: recordResult.reason },
    )
  }

  return 'valid'
}

export const prepareCreate = async (opts: {
  did: DidString
  collection: NsidString
  rkey?: RecordKeyString
  swapCid?: Cid | null
  record: LexMap
  validate?: boolean
  validationPath?: (string | number)[]
  replay?: boolean
}): Promise<PreparedCreate> => {
  const { cid, uri, record, blobs, validationStatus } = await prepareWrite(opts)

  return {
    action: WriteOpAction.Create,
    uri,
    cid,
    swapCid: opts.swapCid,
    record,
    blobs,
    validationStatus,
  }
}

export const prepareUpdate = async (opts: {
  did: DidString
  collection: NsidString
  rkey: RecordKeyString
  swapCid?: Cid | null
  record: LexMap
  validate?: boolean
  validationPath?: (string | number)[]
  replay?: boolean
}): Promise<PreparedUpdate> => {
  const { cid, uri, record, blobs, validationStatus } = await prepareWrite(opts)

  return {
    action: WriteOpAction.Update,
    uri,
    cid,
    swapCid: opts.swapCid,
    record,
    blobs,
    validationStatus,
  }
}

async function prepareWrite(opts: {
  did: string
  collection: NsidString
  rkey?: RecordKeyString
  record: LexMap
  validate?: boolean
  validationPath?: (string | number)[]
  replay?: boolean
}): Promise<{
  record: TypedLexMap
  blobs: TypedBlobRef[]
  validationStatus?: ValidationStatus
  uri: AtUri
  cid: Cid
}> {
  // @NOTE deliberately ahead of, and independent of, validateRecord: `validate:
  // false` waives schema checking, not the ballot policy. prepareDelete does not
  // route through here, so removing an existing ballot stays possible. `replay`
  // is the sole escape and belongs to sequencer recovery re-emitting history that
  // was already committed — never set it from an XRPC handler.
  if (!opts.replay) {
    const refusal =
      ballotWriteRefusal(opts.collection, opts.record) ??
      reactionWriteRefusal(opts.collection, opts.record)
    if (refusal) throw new BallotRefusedError(refusal)
    const repostRefusal = repostWriteRefusal(opts.collection)
    if (repostRefusal) throw new UnsupportedRecordError(repostRefusal)
    if (opts.collection === 'com.para.civic.vote') {
      try {
        if (!(await verifyCabildeoProof(opts.did, opts.record))) {
          throw new BallotRefusedError(
            'A valid cabildeo vote proof is required',
          )
        }
      } catch (error) {
        if (error instanceof BallotRefusedError) throw error
        throw new BallotRefusedError(
          'Civic vote verification is unavailable; no vote was written',
        )
      }
    }
    if (opts.collection === 'com.para.civic.delegation') {
      try {
        if (!(await verifyCabildeoDelegation(opts.did, opts.record))) {
          throw new BallotRefusedError(
            'A valid civic delegation proof is required',
          )
        }
      } catch (error) {
        if (error instanceof BallotRefusedError) throw error
        throw new BallotRefusedError(
          'Civic delegation verification is unavailable; no delegation was written',
        )
      }
    }
  }

  const record: null | TypedLexMap =
    opts.record.$type === undefined
      ? { ...opts.record, $type: opts.collection }
      : opts.record.$type === opts.collection
        ? (opts.record as TypedLexMap)
        : null

  if (!record) {
    throw new InvalidRecordError(
      `Invalid $type: expected ${opts.collection}, got ${opts.record.$type}`,
    )
  }

  // @NOTE the rkey will be validated against the schema later
  if (opts.rkey != null) {
    if (!isValidRecordKey(opts.rkey)) {
      throw new InvalidRecordError(`Invalid record key: ${opts.rkey}`)
    }
    if (hasExplicitSlur(opts.rkey)) {
      throw new InvalidRecordError('Unacceptable slur in record key')
    }
  }

  const nextRkey = TID.next()
  const rkey = opts.rkey || nextRkey.toString()

  return {
    record,
    // @NOTE we validate before enumerating blobs, so that we can provide more
    // accurate validations error (esp. in case of legacy blobs).
    validationStatus: validateRecord(record, rkey, opts),
    blobs: Array.from(
      enumBlobRefs(record, { strict: false, allowLegacy: true }),
      (blob) => {
        // @NOTE as we migrated from legacy blobs to non legacy blobs, we wanted
        // to prevent the creation of legacy blobs. Note that this prevents the
        // creation of (legitimate) records that have the same shape as legacy
        // blob refs ({ cid: "<cid>", mimeType: "<mime-type>" }), but this was
        // deemed an acceptable tradeoff to prevent the creation of new legacy
        // blobs. Since that migration happened a while ago, we can probably
        // remove this check in the future, by removing the "allowLegacy" option.
        if (isLegacyBlobRef(blob)) {
          throw new InvalidRecordError(
            `Legacy blobs are not allowed (${blob.cid})`,
          )
        }
        return blob
      },
    ),
    uri: AtUri.make(opts.did, opts.collection, rkey),
    cid: await cidForCbor(encode(record)),
  }
}

export const prepareDelete = (opts: {
  did: DidString
  collection: NsidString
  rkey: RecordKeyString
  swapCid?: Cid | null
}): PreparedDelete => {
  const { did, collection, rkey, swapCid } = opts
  return {
    action: WriteOpAction.Delete,
    uri: AtUri.make(did, collection, rkey),
    swapCid,
  }
}

export const createWriteToOp = (write: PreparedCreate): RecordCreateOp => ({
  action: WriteOpAction.Create,
  collection: write.uri.collectionSafe,
  rkey: write.uri.rkeySafe,
  record: write.record,
})

export const updateWriteToOp = (write: PreparedUpdate): RecordUpdateOp => ({
  action: WriteOpAction.Update,
  collection: write.uri.collectionSafe,
  rkey: write.uri.rkeySafe,
  record: write.record,
})

export const deleteWriteToOp = (write: PreparedDelete): RecordDeleteOp => ({
  action: WriteOpAction.Delete,
  collection: write.uri.collectionSafe,
  rkey: write.uri.rkeySafe,
})

export const writeToOp = (write: PreparedWrite): RecordWriteOp => {
  switch (write.action) {
    case WriteOpAction.Create:
      return createWriteToOp(write)
    case WriteOpAction.Update:
      return updateWriteToOp(write)
    case WriteOpAction.Delete:
      return deleteWriteToOp(write)
    default:
      throw new Error(`Unrecognized action: ${write}`)
  }
}
