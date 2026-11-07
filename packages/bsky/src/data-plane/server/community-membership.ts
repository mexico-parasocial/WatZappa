import { type Expression, sql } from 'kysely'
import {
  type CommunityMember,
  type CommunityOffice,
  type CommunityRole,
  activeCommunityOffices,
  effectiveCommunityMember,
  resolveCapabilities,
} from '@atproto/common'
import type { AuthoritySnapshot } from './community-authority.js'
import type { Database } from './db/index.js'

/*
 * OD-9 phase 3: the one place that answers "who belongs to this community,
 * and with which offices". A community is named by its URI everywhere: a
 * community account's is its profile, `at://<did>/com.para.community.profile/self`,
 * and its answers come only from `para_community_member_state`, the fold of
 * its chain. Any other URI is a legacy board, answered from the old tables
 * until phase 5 deletes them.
 */

const PROFILE_COLLECTION = 'com.para.community.profile'

export function communityAccountUri(did: string): string {
  return `at://${did}/${PROFILE_COLLECTION}/self`
}

/** The community account's DID, if `uri` names one; `null` for a board. */
export function communityAccountDid(uri: string): string | null {
  const match =
    /^at:\/\/(did:[^/]+)\/com\.para\.community\.profile\/self$/.exec(uri)
  return match ? match[1] : null
}

/** A member-state row (`alias`) that is active now: suspensions end alone. */
export function effectivelyActiveSql(alias: string): Expression<boolean> {
  return sql<boolean>`(
    ${sql.ref(`${alias}.status`)} = 'active'
    or (
      ${sql.ref(`${alias}.status`)} = 'suspended'
      and ${sql.ref(`${alias}.suspendedUntil`)}::timestamptz <= now()
    )
  )`
}

/** Snapshots for members of a community account, as of `now`. */
export async function accountSnapshots(
  db: Database,
  communityDid: string,
  subjects: readonly string[],
  now: number,
): Promise<Map<string, AuthoritySnapshot>> {
  const unique = [...new Set(subjects)]
  const rows =
    unique.length === 0
      ? []
      : await db.db
          .selectFrom('para_community_member_state')
          .selectAll()
          .where('community', '=', communityDid)
          .where('did', 'in', unique)
          .execute()
  const byDid = new Map(rows.map((row) => [row.did, toMember(row)]))
  return new Map(
    unique.map((did) => [did, accountSnapshot(byDid.get(did), now)]),
  )
}

function accountSnapshot(
  member: CommunityMember | undefined,
  now: number,
): AuthoritySnapshot {
  const effective = effectiveCommunityMember(member, now)
  const roles: CommunityRole[] =
    effective?.status === 'active'
      ? ['member', ...activeCommunityOffices(effective, now)]
      : []
  return {
    membershipState:
      effective?.status === 'active' || effective?.status === 'suspended'
        ? effective.status
        : 'none',
    roles,
    evidence: {},
    capabilities: resolveCapabilities(roles),
    events: [],
    usedLegacyFallback: false,
  }
}

/**
 * DIDs of the community's active members, as a subquery with column `did`.
 * Compose it with `where(column, 'in', ...)` or a join.
 */
export function activeMemberDids(db: Database, communityUri: string) {
  const accountDid = communityAccountDid(communityUri)
  if (accountDid) {
    return db.db
      .selectFrom('para_community_member_state as member')
      .where('member.community', '=', accountDid)
      .where(effectivelyActiveSql('member'))
      .select('member.did as did')
  }
  return db.db
    .selectFrom('para_community_membership as member')
    .where('member.communityUri', '=', communityUri)
    .where('member.membershipState', '=', 'active')
    .select('member.creator as did')
}

/** Active memberships across several communities, as `[communityUri, did]`. */
export async function activeMemberships(
  db: Database,
  communityUris: readonly string[],
): Promise<Array<[string, string]>> {
  const lists = await Promise.all(
    [...new Set(communityUris)].map(async (uri) =>
      (await activeMemberDids(db, uri).execute()).map(
        (row) => [uri, row.did] as [string, string],
      ),
    ),
  )
  return lists.flat()
}

/** Active member counts, keyed by community URI. */
export async function countActiveMembers(
  db: Database,
  communityUris: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  await Promise.all(
    [...new Set(communityUris)].map(async (uri) => {
      const row = await db.db
        .selectFrom(activeMemberDids(db, uri).as('members'))
        .select(sql<number>`count(*)`.as('count'))
        .executeTakeFirst()
      counts.set(uri, Number(row?.count) || 0)
    }),
  )
  return counts
}

/** Whether `did` is an active member of the community now. */
export async function isActiveMember(
  db: Database,
  communityUri: string,
  did: string,
): Promise<boolean> {
  const row = await db.db
    .selectFrom(activeMemberDids(db, communityUri).as('members'))
    .select('members.did')
    .where('members.did', '=', did)
    .executeTakeFirst()
  return Boolean(row)
}

/** URIs of every community `did` is an active member of. */
export async function activeCommunityUrisOf(
  db: Database,
  did: string,
): Promise<string[]> {
  const [accounts, boards] = await Promise.all([
    db.db
      .selectFrom('para_community_member_state as member')
      .where('member.did', '=', did)
      .where(effectivelyActiveSql('member'))
      .select('member.community')
      .execute(),
    db.db
      .selectFrom('para_community_membership')
      .where('creator', '=', did)
      .where('membershipState', '=', 'active')
      .select('communityUri')
      .execute(),
  ])
  return [
    ...accounts.map((row) => communityAccountUri(row.community)),
    ...boards.map((row) => row.communityUri),
  ]
}

/**
 * Members of a community account holding `office` now. Boards answer from
 * their authority events; see `getAuthoritySnapshots`.
 */
export async function accountOfficeHolders(
  db: Database,
  communityDid: string,
  office: CommunityOffice,
): Promise<string[]> {
  const rows = await db.db
    .selectFrom('para_community_member_state as member')
    .where('member.community', '=', communityDid)
    .where(effectivelyActiveSql('member'))
    .where(sql<boolean>`member.offices ? ${office}`)
    .select('member.did')
    .orderBy('member.did')
    .execute()
  return rows.map((row) => row.did)
}

/**
 * Founded community accounts that `ref` names: by profile URI, DID, handle,
 * or slug (the handle's first label). Never by display name, which nothing
 * keeps unique.
 */
export async function resolveCommunityAccountUris(
  db: Database,
  ref: string | null | undefined,
): Promise<string[]> {
  const value = ref?.trim()
  if (!value) return []
  const slug = value.toLowerCase().replace(/^p\//, '')
  const rows = await db.db
    .selectFrom('para_community_account as account')
    .leftJoin('actor', 'actor.did', 'account.did')
    .where('account.governanceMode', 'is not', null)
    .where((eb) =>
      eb.or([
        eb('account.did', '=', communityAccountDid(value) ?? value),
        eb('actor.handle', '=', value.toLowerCase()),
        eb(sql`split_part(actor.handle, '.', 1)`, '=', slug),
      ]),
    )
    .select('account.did')
    .execute()
  return rows.map((row) => communityAccountUri(row.did))
}

function toMember(row: {
  status: string
  offices: string[]
  suspendedUntil: string | null
  since: number
}): CommunityMember {
  return {
    status: row.status as CommunityMember['status'],
    offices: row.offices as CommunityOffice[],
    ...(row.suspendedUntil ? { suspendedUntil: row.suspendedUntil } : {}),
    since: row.since,
  }
}
