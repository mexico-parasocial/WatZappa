import { WriteOpAction } from '@atproto/repo'
import { AtUri } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'
import type { ActorStoreTransactor } from '../../../../actor-store/actor-store-transactor.js'
import type { PreparedWrite } from '../../../../repo/index.js'

export const SHARED_CONTENT_COLLECTION = 'com.para.community.sharedContent'

/**
 * Records that once carried a community's membership, offices, relations and
 * moderation from members' own repos (OD-9 §4). A community's chain decides
 * all of these now, so no repo accepts a new one. They can still be deleted.
 */
export const LEGACY_COMMUNITY_COLLECTIONS: ReadonlySet<string> = new Set([
  'com.para.community.board',
  'com.para.community.membership',
  'com.para.community.governance',
  'com.para.community.roleAcceptance',
  'com.para.community.authorityEvent',
  'com.para.community.relation',
  'com.para.community.sharedContentAction',
])

/** A community is named by its account's profile record. */
export const assertCommunityUri = (value: string) => {
  let uri: AtUri
  try {
    uri = new AtUri(value)
  } catch {
    throw new InvalidRequestError('communityUri must be a valid AT URI.')
  }
  if (
    uri.collection !== 'com.para.community.profile' ||
    uri.rkey !== 'self' ||
    !uri.hostname.startsWith('did:')
  ) {
    throw new InvalidRequestError(
      'communityUri must reference a community account profile.',
    )
  }
  return uri
}

/**
 * PARA's community write rules for generic repo writes (createRecord,
 * putRecord, applyWrites, deleteRecord). Call inside the write transaction.
 *
 * - A community account's repo is written only by its policy, through
 *   `com.para.community.act`.
 * - Records the chain replaced are refused everywhere (they may be deleted).
 */
export const assertCommunityRepoWrites = async (
  actorTxn: ActorStoreTransactor,
  writes: PreparedWrite[],
) => {
  if (await actorTxn.community.isCommunity()) {
    throw new InvalidRequestError(
      'Community repos are written only through com.para.community.act.',
      'CommunityRepo',
    )
  }
  for (const write of writes) {
    if (
      write.action !== WriteOpAction.Delete &&
      LEGACY_COMMUNITY_COLLECTIONS.has(write.uri.collection)
    ) {
      throw new InvalidRequestError(
        `${write.uri.collection} records are retired; a community's chain decides this now.`,
        'LegacyCommunityRecord',
      )
    }
  }
}
