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
const id = 'com.para.agent.defs'

export interface MessageView {
  $type?: 'com.para.agent.defs#messageView'
  id: string
  text: string
  sender: 'user' | 'agent' | (string & {})
  createdAt: string
}

const hashMessageView = 'messageView'

export function isMessageView<V>(v: V) {
  return is$typed(v, id, hashMessageView)
}

export function validateMessageView<V>(v: V) {
  return validate<MessageView & V>(v, id, hashMessageView)
}
