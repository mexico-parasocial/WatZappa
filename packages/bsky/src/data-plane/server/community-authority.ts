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

/** Rows per `in (...)` list, well under the 65535 bind parameters Postgres allows. */
const SNAPSHOT_CHUNK = 5000

/**
 * Which of `dids` are active members of the community, as of `now`. The one
 * rule for "may this account vote here", shared by ballot indexing, tallies
 * and delegations: a community's members are its folded chain's, so what an
 * account says about itself never counts.
 */
export async function filterActiveMembers(
  db: Database,
  communityUri: string,
  dids: readonly string[],
  now = Date.now(),
): Promise<Set<string>> {
  const unique = [...new Set(dids)]
  const active = new Set<string>()
  for (let i = 0; i < unique.length; i += SNAPSHOT_CHUNK) {
    const snapshots = await getAuthoritySnapshots(
      db,
      communityUri,
      unique.slice(i, i + SNAPSHOT_CHUNK),
      now,
    )
    for (const [did, snapshot] of snapshots) {
      if (snapshot.membershipState === 'active') active.add(did)
    }
  }
  return active
}

/** Every active member of the community, by `filterActiveMembers`. */
export async function listActiveMembers(
  db: Database,
  communityUri: string,
  now = Date.now(),
): Promise<Set<string>> {
  const accountDid = communityAccountDid(communityUri)
  if (!accountDid) return new Set()
  const rows = await db.db
    .selectFrom('para_community_member_state')
    .where('community', '=', accountDid)
    .select('did')
    .execute()
  return filterActiveMembers(
    db,
    communityUri,
    rows.map((row) => row.did),
    now,
  )
}
