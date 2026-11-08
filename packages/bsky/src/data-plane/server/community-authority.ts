import type { CommunityRole } from '@atproto/common'
import {
  accountSnapshots,
  communityAccountDid,
} from './community-membership.js'
import type { Database } from './db/index.js'

/*
 * A member's standing in a community, as of a moment. A community is an
 * account (OD-9) and its answers come from its folded chain alone; any other
 * URI names nothing, so everyone is a stranger to it.
 */

export interface AuthoritySnapshot {
  membershipState: 'none' | 'active' | 'suspended'
  roles: CommunityRole[]
  capabilities: string[]
}

export async function getAuthoritySnapshot(
  db: Database,
  communityUri: string,
  subject: string,
  now = Date.now(),
): Promise<AuthoritySnapshot> {
  const snapshots = await getAuthoritySnapshots(
    db,
    communityUri,
    [subject],
    now,
  )
  return snapshots.get(subject) as AuthoritySnapshot
}

/** `getAuthoritySnapshot` for several subjects of one community at once. */
export async function getAuthoritySnapshots(
  db: Database,
  communityUri: string,
  subjects: readonly string[],
  now = Date.now(),
): Promise<Map<string, AuthoritySnapshot>> {
  const accountDid = communityAccountDid(communityUri)
  if (accountDid) return accountSnapshots(db, accountDid, subjects, now)
  return new Map(
    [...new Set(subjects)].map((subject) => [
      subject,
      { membershipState: 'none', roles: [], capabilities: [] },
    ]),
  )
}
