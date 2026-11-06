import { sql } from 'kysely'
import {
  accountSnapshots,
  communityAccountDid,
  effectivelyActiveSql,
} from './community-membership.js'
import type { Database } from './db/index.js'

/*
 * What a community account's chain says about content, relations and briefing
 * packs (OD-9 §3.9). A board answers the same questions from records in
 * members' repos; an account answers from `para_community_content_state`,
 * `para_community_relation_half` and `para_community_briefing_state`, which
 * the chain fold writes. Nothing here reads `indexedAt`.
 */

export interface AccountShareOverlay {
  /** The sharer is an active member, so the share counts at all. */
  counts: boolean
  hidden: boolean
  pinned: boolean
  hiddenAt: string | null
  hiddenBy: string | null
}

/**
 * Overlays for the shares that sit in a community account, keyed by share
 * URI. A share counts when its author is an active member, and is hidden or
 * pinned only by a steward's event.
 */
export async function accountShareOverlays(
  db: Database,
  shares: ReadonlyArray<{
    uri: string
    communityUri: string
    sharedBy: string
  }>,
): Promise<Map<string, AccountShareOverlay>> {
  const overlays = new Map<string, AccountShareOverlay>()
  const inAccounts = shares.filter((s) => communityAccountDid(s.communityUri))
  if (inAccounts.length === 0) return overlays

  const dids = [
    ...new Set(inAccounts.map((s) => communityAccountDid(s.communityUri)!)),
  ]
  const [members, states] = await Promise.all([
    db.db
      .selectFrom('para_community_member_state as member')
      .where('member.community', 'in', dids)
      .where('member.did', 'in', [
        ...new Set(inAccounts.map((s) => s.sharedBy)),
      ])
      .where(effectivelyActiveSql('member'))
      .select(['member.community', 'member.did'])
      .execute(),
    db.db
      .selectFrom('para_community_content_state')
      .where('community', 'in', dids)
      .where(
        'target',
        'in',
        inAccounts.map((s) => s.uri),
      )
      .selectAll()
      .execute(),
  ])
  const active = new Set(members.map((m) => `${m.community}|${m.did}`))
  const state = new Map(states.map((s) => [`${s.community}|${s.target}`, s]))
  for (const share of inAccounts) {
    const community = communityAccountDid(share.communityUri)!
    const row = state.get(`${community}|${share.uri}`)
    overlays.set(share.uri, {
      counts: active.has(`${community}|${share.sharedBy}`),
      hidden: row?.hidden ?? false,
      pinned: row?.pinned ?? false,
      hiddenAt: row?.hiddenAt ?? null,
      hiddenBy: row?.hiddenBy ?? null,
    })
  }
  return overlays
}

/** Shares that count in each community account: member-authored and not hidden. */
export async function countAccountShares(
  db: Database,
  communityUris: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const dids = communityUris
    .map((uri) => communityAccountDid(uri))
    .filter((did): did is string => did !== null)
  if (dids.length === 0) return counts
  const rows = await db.db
    .selectFrom('para_community_shared_content as share')
    .innerJoin('para_community_member_state as member', (join) =>
      join
        .onRef('member.did', '=', 'share.sharedBy')
        .on(
          sql<boolean>`share."communityUri" = 'at://' || member.community || '/com.para.community.profile/self'`,
        ),
    )
    .leftJoin('para_community_content_state as state', (join) =>
      join
        .onRef('state.community', '=', 'member.community')
        .onRef('state.target', '=', 'share.uri'),
    )
    .where('member.community', 'in', dids)
    .where(effectivelyActiveSql('member'))
    .where(sql<boolean>`coalesce(state.hidden, false) = false`)
    .select(['share.communityUri', sql<number>`count(*)`.as('count')])
    .groupBy('share.communityUri')
    .execute()
  for (const row of rows) counts.set(row.communityUri, Number(row.count) || 0)
  return counts
}

/**
 * Relations between community accounts: a parent's `link` and the child's
 * `accept`, both standing. A community holds one half per counterpart, so a
 * later `accept` replaces an earlier `link` for the same pair and two
 * communities can never be each other's parent. Chains of any length are
 * covered too: no chain holds both ends of a cycle, so a relation counts only
 * if its child cannot reach its parent through other standing relations. Every
 * relation on a cycle is therefore set aside until one of them is withdrawn,
 * whichever was written last. Shaped like a relation row; `uri` and `cid` are
 * the parent's `link` event, and the relation dates from the later of the two
 * events.
 */
export function accountRelationRows(db: Database) {
  // Relations whose two halves both stand, as (parent, child) pairs.
  const pairs = sql`(
    select l.community as parent, l.other as child
    from para_community_relation_half l
    join para_community_relation_half a
      on a.community = l.other and a.other = l.community and a.half = 'accept'
    where l.half = 'link'
  )`
  return (
    db.db
      .selectFrom('para_community_relation_half as link')
      .innerJoin('para_community_relation_half as accepted', (join) =>
        join
          .onRef('accepted.community', '=', 'link.other')
          .onRef('accepted.other', '=', 'link.community')
          .on('accepted.half', '=', 'accept'),
      )
      .where('link.half', '=', 'link')
      // `union` drops repeated nodes, so the walk ends on a cycle.
      .where(
        sql<boolean>`not exists (
        with recursive below(node) as (
          select p.child from ${pairs} p where p.parent = link.other
          union
          select p.child from below join ${pairs} p on p.parent = below.node
        )
        select 1 from below where node = link.community
      )`,
      )
      .select([
        sql<string>`'at://' || link.community || '/com.para.community.profile/self'`.as(
          'parentCommunityUri',
        ),
        sql<string>`'at://' || link.other || '/com.para.community.profile/self'`.as(
          'childCommunityUri',
        ),
        'link.eventUri as uri',
        'link.eventCid as cid',
        'link.actor as creator',
        sql<string>`'parentChild'`.as('relation'),
        sql<string>`greatest(link."createdAt", accepted."createdAt")`.as(
          'createdAt',
        ),
        sql<string>`greatest(link."createdAt", accepted."createdAt")`.as(
          'indexedAt',
        ),
      ])
  )
}

/**
 * The chain's state for briefing packs held in community accounts, keyed by
 * pack URI. A pack has a state only while the version on record is the one a
 * steward named; editing it withdraws it until it is published again.
 */
export async function accountBriefingStates(
  db: Database,
  packs: ReadonlyArray<{ uri: string; cid: string; communityUri: string }>,
): Promise<Map<string, string>> {
  const states = new Map<string, string>()
  const inAccounts = packs.filter((p) => communityAccountDid(p.communityUri))
  if (inAccounts.length === 0) return states
  const rows = await db.db
    .selectFrom('para_community_briefing_state')
    .where(
      'target',
      'in',
      inAccounts.map((p) => p.uri),
    )
    .selectAll()
    .execute()
  const byTarget = new Map(rows.map((r) => [`${r.community}|${r.target}`, r]))
  for (const pack of inAccounts) {
    const row = byTarget.get(
      `${communityAccountDid(pack.communityUri)}|${pack.uri}`,
    )
    if (row && row.cid === pack.cid) states.set(pack.uri, row.state)
  }
  return states
}

/**
 * Offers and proposals still open in a community account, newest first, paged
 * by `seq`. An owner or moderator sees every one; anyone else sees the ones
 * addressed to them, since a proposal to sanction a member is not for the
 * rest of the community to read. Lapsed offers are left out even before the
 * chain closes them.
 */
export async function accountOpenOffers(
  db: Database,
  community: string,
  viewer: string,
  limit: number,
  cursor: string,
) {
  const snapshot = viewer
    ? (await accountSnapshots(db, community, [viewer], Date.now())).get(viewer)
    : undefined
  const steward =
    snapshot?.roles.includes('owner') || snapshot?.roles.includes('moderator')
  if (!steward && !viewer) return { offers: [], cursor: '' }
  const after = /^[0-9]+$/.test(cursor) ? Number(cursor) : null
  const rows = await db.db
    .selectFrom('para_community_open_offer')
    .selectAll()
    .where('community', '=', community)
    .where(sql<boolean>`"expiresAt"::timestamptz > now()`)
    .$if(!steward, (qb) => qb.where('subject', '=', viewer))
    .$if(after !== null, (qb) => qb.where('seq', '<', after as number))
    .orderBy('seq', 'desc')
    .limit(limit + 1)
    .execute()
  const page = rows.slice(0, limit)
  return {
    offers: page.map((row) => ({
      seq: row.seq,
      office: row.office,
      subject: row.subject,
      issuer: row.issuer,
      expiresAt: row.expiresAt,
    })),
    cursor: rows.length > limit ? String(page[page.length - 1].seq) : '',
  }
}
