import type { AtUriString, DidString } from '@atproto/syntax'
import { InvalidRequestError, UpstreamFailureError } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { com } from '../../../../lexicons/index.js'
import { dbLogger } from '../../../../logger.js'

/**
 * Refuses with `refusal` unless the AppView verifies that `did` holds
 * `capability` in the community. Moderator and owner roles come from
 * authority events spread across many repos, which only the AppView indexes
 * and verifies. The viewer's own membership record is self-written and proves
 * nothing above membership, so it is never consulted. Call outside a repo
 * transaction.
 */
export const assertCommunityCapability = async (
  ctx: AppContext,
  did: DidString,
  communityUri: AtUriString,
  capability: string,
  refusal: () => Error,
) => {
  if (!ctx.bskyAppView) {
    throw new UpstreamFailureError(
      'Community authority cannot be verified without an AppView.',
    )
  }
  let allowed: boolean
  try {
    const headers = await ctx.appviewAuthHeaders(
      did,
      com.para.community.getAuthorization.$lxm,
    )
    const res = await ctx.bskyAppView.client.call(
      com.para.community.getAuthorization,
      { community: communityUri, action: capability },
      headers,
    )
    allowed = res.authorization.status === 'allowed'
  } catch (err) {
    dbLogger.error({ err, did, communityUri }, 'community.authorityCheckFailed')
    throw new UpstreamFailureError(
      'Could not verify community authority. Try again.',
    )
  }
  if (!allowed) throw refusal()
}

/** Refusal for a capability that only owners and moderators hold. */
export const stewardRequired = (message: string) => () =>
  new InvalidRequestError(message, 'CommunityStewardRequired')
