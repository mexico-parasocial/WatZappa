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
const id = 'com.para.community.socialActivity'

export interface Main {
  $type: 'com.para.community.socialActivity'
  communityUri: string
  title: string
  description?: string
  startsAt: string
  endsAt?: string
  location?: string
  status: 'planned' | 'active' | 'completed' | 'cancelled' | (string & {})
  details:
    | $Typed<PeacefulMarch>
    | $Typed<SignatureDrive>
    | $Typed<Assembly>
    | $Typed<Cabildeo>
    | { $type: string }
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

export interface PeacefulMarch {
  $type?: 'com.para.community.socialActivity#peacefulMarch'
  meetingPoint: string
  route?: string
  destination?: string
  /** Status of the notice or permit before local authorities. */
  permitStatus:
    'not_required' | 'requested' | 'granted' | 'denied' | (string & {})
  permitReference?: string
  expectedAttendance?: number
  /** Public contact of the safety or logistics team (never a personal phone without consent). */
  safetyContact?: string
  accessibilityNotes?: string
}

const hashPeacefulMarch = 'peacefulMarch'

export function isPeacefulMarch<V>(v: V) {
  return is$typed(v, id, hashPeacefulMarch)
}

export function validatePeacefulMarch<V>(v: V) {
  return validate<PeacefulMarch & V>(v, id, hashPeacefulMarch)
}

export interface SignatureDrive {
  $type?: 'com.para.community.socialActivity#signatureDrive'
  instrumentType:
    | 'bill'
    | 'law'
    | 'citizen_initiative'
    | 'referendum'
    | 'petition'
    | (string & {})
  instrumentTitle: string
  instrumentUrl?: string
  targetSignatures: number
  signaturesCollected?: number
  deadline?: string
  collectionPoints?: string[]
  /** What signers must bring or meet, e.g. a voter ID from the district. */
  signerRequirements?: string
}

const hashSignatureDrive = 'signatureDrive'

export function isSignatureDrive<V>(v: V) {
  return is$typed(v, id, hashSignatureDrive)
}

export function validateSignatureDrive<V>(v: V) {
  return validate<SignatureDrive & V>(v, id, hashSignatureDrive)
}

export interface Assembly {
  $type?: 'com.para.community.socialActivity#assembly'
  format: 'in_person' | 'online' | 'hybrid' | (string & {})
  meetingUrl?: string
  agenda?: string[]
  quorumRequired?: number
}

const hashAssembly = 'assembly'

export function isAssembly<V>(v: V) {
  return is$typed(v, id, hashAssembly)
}

export function validateAssembly<V>(v: V) {
  return validate<Assembly & V>(v, id, hashAssembly)
}

/** A conversation held over a period of time: who took part, what each side argued, and where it landed. Voting and delegation are optional extras attached elsewhere, not part of this record. */
export interface Cabildeo {
  $type?: 'com.para.community.socialActivity#cabildeo'
  format: 'in_person' | 'online' | 'hybrid' | (string & {})
  meetingUrl?: string
  recordingUrl?: string
  participants?: string[]
  arguments?: string[]
  outcome?: string
}

const hashCabildeo = 'cabildeo'

export function isCabildeo<V>(v: V) {
  return is$typed(v, id, hashCabildeo)
}

export function validateCabildeo<V>(v: V) {
  return validate<Cabildeo & V>(v, id, hashCabildeo)
}
