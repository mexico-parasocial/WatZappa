import { createHash } from 'node:crypto'
import { TID } from '@atproto/common-web'

/** Stable, valid record keys for repeatable demo writes. */
export function seedTid(name: string): string {
  const hash = createHash('sha256').update(name).digest()
  return TID.fromTime(
    1_700_000_000_000_000 + hash.readUIntBE(0, 6),
    0,
  ).toString()
}
