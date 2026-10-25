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
const id = 'app.bsky.video.defs'

export interface JobStatus {
  $type?: 'app.bsky.video.defs#jobStatus'
  jobId: string
  did: string
  /** The state of the video processing job. All values not listed as a known value indicate that the job is in process. */
  state:
    | 'JOB_STATE_CREATED'
    | 'JOB_STATE_ENCODING'
    | 'JOB_STATE_ENCODED'
    | 'JOB_STATE_SCANNING'
    | 'JOB_STATE_SCANNED'
    | 'JOB_STATE_UPLOADING'
    | 'JOB_STATE_UPLOADED'
    | 'JOB_STATE_COMPLETED'
    | 'JOB_STATE_FAILED'
    | (string & {})
  /** Progress within the current processing state. */
  progress?: number
  blob?: BlobRef
  error?: string
  /** A machine-readable code for why the video processing job failed. */
  failureCode?:
    | 'validation_failure'
    | 'encoding_failure'
    | 'pds_upload_failure'
    | 'pds_upload_unsupported_blob_size'
    | 'generic_failure'
    | (string & {})
  message?: string
}

const hashJobStatus = 'jobStatus'

export function isJobStatus<V>(v: V) {
  return is$typed(v, id, hashJobStatus)
}

export function validateJobStatus<V>(v: V) {
  return validate<JobStatus & V>(v, id, hashJobStatus)
}
