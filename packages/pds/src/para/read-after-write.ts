import { parseCid } from '@atproto/lex-data'
import { cborToLexRecord } from '@atproto/repo'
import type { AtUri, DatetimeString } from '@atproto/syntax'
import type { LocalRecords } from '../read-after-write/types.js'

export const PARA_POST_COLLECTION = 'com.para.post'

/**
 * The fields of a `com.para.post` record that read-after-write reads. The
 * record lexicon is not part of this PDS's manifest, so this is structural.
 */
export type ParaPostRecord = {
  $type: typeof PARA_POST_COLLECTION
  text: string
  createdAt: string
  reply?: { root: { uri: string }; parent: { uri: string } }
  langs?: string[]
  tags?: string[]
  flairs?: string[]
  postType?: string
}

/**
 * Called by `RecordReader.getRecordsSinceRev` for every local record that is
 * neither the profile nor an `app.bsky` post.
 */
export function collectParaLocalRecord(
  result: LocalRecords,
  uri: AtUri,
  cur: { cid: string; indexedAt: string; content: Uint8Array },
): void {
  if (uri.collection !== PARA_POST_COLLECTION) return
  result.paraPosts.push({
    uri,
    cid: parseCid(cur.cid),
    indexedAt: cur.indexedAt as DatetimeString,
    record: cborToLexRecord(cur.content) as unknown as ParaPostRecord,
  })
}
