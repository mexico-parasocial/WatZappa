import { sql } from 'kysely'
import {
  type CommunityMember,
  type CommunityOffer,
  type CommunityOfferKind,
  type CommunityOffice,
  type CommunityPatch,
  type CommunitySettings,
  type CommunityStateView,
  activeCommunityOffices,
  effectiveCommunityMember,
} from '@atproto/common'
import type { ActorDb } from '../../actor-store/db/index.js'

export interface CommunityHead {
  seq: number
  uri: string
  cid: string
  settings: CommunitySettings
}

/**
 * The fold of a community account's own event chain (OD-9), kept in that
 * account's actor store. Only `com.para.community.create` and `act` write it,
 * in the same transaction as the event they append.
 */
export class CommunityStore {
  constructor(private readonly db: ActorDb) {}

  /**
   * Whether this store belongs to a community account. Stores created before
   * migration 006 lack the tables, so look before reading.
   */
  async isCommunity(): Promise<boolean> {
    const table = await sql<{ name: string }>`
      select name from sqlite_master
      where type = 'table' and name = 'community_state'
    `.execute(this.db.db)
    if (table.rows.length === 0) return false
    return (await this.head()) !== null
  }

  async head(): Promise<CommunityHead | null> {
    const row = await this.db.db
      .selectFrom('community_state')
      .selectAll()
      .where('id', '=', 1)
      .executeTakeFirst()
    if (!row) return null
    return {
      seq: row.lastSeq,
      uri: row.lastUri,
      cid: row.lastCid,
      settings: {
        governanceMode:
          row.governanceMode as CommunitySettings['governanceMode'],
        admissionMode: row.admissionMode as CommunitySettings['admissionMode'],
      },
    }
  }

  /**
   * A synchronous view for `applyCommunityEvent`, holding every row the
   * event can read: actor, subject, the offer and its issuer, and the owner
   * count.
   */
  async view(
    community: string,
    head: CommunityHead | null,
    event: { actor: string; subject: string; offer?: number },
  ): Promise<CommunityStateView> {
    const offer =
      event.offer === undefined ? undefined : await this.offer(event.offer)
    const dids = [event.actor, event.subject, offer?.issuer].filter(
      (did): did is string => did !== undefined,
    )
    const members = new Map(
      (
        await this.db.db
          .selectFrom('community_member')
          .selectAll()
          .where('did', 'in', [...new Set(dids)])
          .execute()
      ).map((row) => [row.did, toMember(row)]),
    )
    const owners = await this.db.db
      .selectFrom('community_member')
      .select(sql<number>`count(*)`.as('count'))
      .where('status', '=', 'active')
      .where(
        sql<boolean>`exists (
        select 1 from json_each(community_member.offices) where value = 'owner'
      )`,
      )
      .executeTakeFirstOrThrow()
    return {
      community,
      settings: head?.settings ?? null,
      lastSeq: head?.seq ?? 0,
      member: (did) => members.get(did),
      openOffer: (seq) => (offer && offer.seq === seq ? offer : undefined),
      ownerCount: () => Number(owners.count),
    }
  }

  /** Whether `did` is an active member of this community as of `at`. */
  async isActiveMember(did: string, at = Date.now()): Promise<boolean> {
    const row = await this.db.db
      .selectFrom('community_member')
      .selectAll()
      .where('did', '=', did)
      .executeTakeFirst()
    return (
      effectiveCommunityMember(row && toMember(row), at)?.status === 'active'
    )
  }

  /** Whether `did` holds the owner office and is active as of `at`. */
  async isActiveOwner(did: string, at = Date.now()): Promise<boolean> {
    const row = await this.db.db
      .selectFrom('community_member')
      .selectAll()
      .where('did', '=', did)
      .executeTakeFirst()
    return activeCommunityOffices(row && toMember(row), at).includes('owner')
  }

  /** Every member the chain has recorded, whatever their status. */
  async listMembers(): Promise<Array<[string, CommunityMember]>> {
    const rows = await this.db.db
      .selectFrom('community_member')
      .selectAll()
      .execute()
    return rows.map((row) => [row.did, toMember(row)])
  }

  /** Members whose stored status is `suspended`, lapsed or not. */
  async listSuspended(): Promise<Array<[string, CommunityMember]>> {
    const rows = await this.db.db
      .selectFrom('community_member')
      .selectAll()
      .where('status', '=', 'suspended')
      .execute()
    return rows.map((row) => [row.did, toMember(row)])
  }

  async apply(
    patch: CommunityPatch,
    head: Omit<CommunityHead, 'settings'> & { settings?: CommunitySettings },
  ): Promise<void> {
    for (const [did, member] of patch.members) {
      const row = {
        did,
        status: member.status,
        offices: JSON.stringify(member.offices),
        suspendedUntil: member.suspendedUntil ?? null,
        since: member.since,
      }
      await this.db.db
        .insertInto('community_member')
        .values(row)
        .onConflict((oc) => oc.column('did').doUpdateSet(row))
        .execute()
    }
    for (const offer of patch.openedOffers) {
      await this.db.db.insertInto('community_offer').values(offer).execute()
    }
    if (patch.closedOffers.length > 0) {
      await this.db.db
        .deleteFrom('community_offer')
        .where('seq', 'in', patch.closedOffers)
        .execute()
    }
    const settings = patch.settings ?? head.settings
    if (settings) {
      const row = {
        id: 1 as const,
        lastSeq: head.seq,
        lastUri: head.uri,
        lastCid: head.cid,
        governanceMode: settings.governanceMode,
        admissionMode: settings.admissionMode,
      }
      await this.db.db
        .insertInto('community_state')
        .values(row)
        .onConflict((oc) => oc.column('id').doUpdateSet(row))
        .execute()
    } else {
      await this.db.db
        .updateTable('community_state')
        .set({ lastSeq: head.seq, lastUri: head.uri, lastCid: head.cid })
        .where('id', '=', 1)
        .execute()
    }
  }

  async isRequestUsed(uri: string): Promise<boolean> {
    return Boolean(
      await this.db.db
        .selectFrom('community_used_request')
        .select('uri')
        .where('uri', '=', uri)
        .executeTakeFirst(),
    )
  }

  async useRequest(uri: string, seq: number): Promise<void> {
    await this.db.db
      .insertInto('community_used_request')
      .values({ uri, seq })
      .execute()
  }

  private async offer(seq: number): Promise<CommunityOffer | undefined> {
    const row = await this.db.db
      .selectFrom('community_offer')
      .selectAll()
      .where('seq', '=', seq)
      .executeTakeFirst()
    return row
      ? { ...row, office: row.office as CommunityOfferKind }
      : undefined
  }
}

function toMember(row: {
  status: string
  offices: string
  suspendedUntil: string | null
  since: number
}): CommunityMember {
  return {
    status: row.status as CommunityMember['status'],
    offices: JSON.parse(row.offices) as CommunityOffice[],
    ...(row.suspendedUntil ? { suspendedUntil: row.suspendedUntil } : {}),
    since: row.since,
  }
}
