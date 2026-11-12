import {
  type CommunityMember,
  type CommunityPatch,
  effectiveCommunityMember,
} from '@atproto/common'
import { type DidString, SpaceRef } from '@atproto/syntax'
import type { ActorStoreTransactor } from '../../actor-store/actor-store-transactor.js'

/** Space type of the member-only space every community account owns. */
export const COMMUNITY_SPACE_TYPE = 'com.para.space.community'
/** Its key: one members' space per community. */
export const COMMUNITY_SPACE_SKEY = 'members'

/** The community's own space; the community DID is its authority (OD-9 §3.11). */
export const communitySpaceUri = (community: DidString): string =>
  new SpaceRef(community, COMMUNITY_SPACE_TYPE, COMMUNITY_SPACE_SKEY).toString()

/**
 * Keeps the space's member list equal to the community's active members, in the
 * transaction that appends the event that changed them. The event chain is the
 * only authority: nothing else may write this list, so a removal, a block or a
 * suspension takes access away in the same commit that records it.
 *
 * The first projection for a community creates the space and copies every
 * current member, so communities founded before Spaces was enabled catch up on
 * their next event.
 *
 * @NOTE A suspension that runs out changes nobody's stored state, so the list
 * would keep that member out until some later event. Each projection therefore
 * re-admits the members whose suspension has ended; anything that grants access
 * between events must still ask {@link isCommunitySpaceMember}.
 */
export async function projectCommunitySpace(
  txn: ActorStoreTransactor,
  community: DidString,
  patch: CommunityPatch,
  at = Date.now(),
): Promise<void> {
  const space = communitySpaceUri(community)
  const existing = await txn.space.getSpace(space)
  // A deleted space stays deleted: recreating it would reopen a tombstone.
  if (existing?.deletedAt) return
  if (!existing) {
    await txn.space.createSpace(space, {
      readPolicy: 'member-list',
      readManagingApp: null,
      writePolicy: 'member-list',
      writeManagingApp: null,
      appAccessType: 'open',
      appAllowed: JSON.stringify([]),
    })
    for (const [did, member] of await txn.community.listMembers()) {
      await setMember(txn, space, did, member, at)
    }
    return
  }
  for (const [did, member] of patch.members) {
    await setMember(txn, space, did, member, at)
  }
  for (const [did, member] of await txn.community.listSuspended()) {
    await setMember(txn, space, did, member, at)
  }
}

/**
 * Whether `did` may use the community's space as of `at`, read from the chain's
 * fold and not from the projected list, so a lapsed suspension counts at once.
 */
export async function isCommunitySpaceMember(
  txn: Pick<ActorStoreTransactor, 'community'>,
  did: string,
  at = Date.now(),
): Promise<boolean> {
  return txn.community.isActiveMember(did, at)
}

async function setMember(
  txn: ActorStoreTransactor,
  space: string,
  did: string,
  member: CommunityMember,
  at: number,
): Promise<void> {
  if (effectiveCommunityMember(member, at)?.status === 'active') {
    await txn.space.putMember(space, did, { read: true, write: true })
  } else {
    await txn.space.removeMember(space, did)
  }
}
