// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Code, isDataplaneError } from '../../../../data-plane/index.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/community/listMembers.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.listMembers({
    auth: ctx.authVerifier.standardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const result = await listMembers({
        ctx,
        params,
        viewer: viewer ?? '',
        viewerIsAdmin:
          auth.credentials.type === 'role' && auth.credentials.admin,
      })
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)

      return {
        encoding: 'application/json' as const,
        body: result,
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

const listMembers = async ({
  ctx,
  params,
  viewer,
  viewerIsAdmin,
}: {
  ctx: AppContext
  params: QueryParams
  viewer: string
  viewerIsAdmin: boolean
}) => {
  const cache = ctx.paraCache
  const cacheKey = cache?.membersKey({
    communityId: params.communityId,
    membershipState: params.membershipState ?? '',
    role: params.role ?? '',
    sort: params.sort ?? '',
    limit: normalizeLimit(params.limit),
    cursor: params.cursor ?? '',
    viewerDid: viewer,
    viewerIsAdmin,
  })
  if (cache && cacheKey) {
    const cached = await cache.get(cacheKey, 'members')
    if (cached) return cached
  }

  const res = await ctx.dataplane
    .getParaCommunityMembers({
      communityId: params.communityId,
      membershipState: params.membershipState ?? '',
      role: params.role ?? '',
      sort: params.sort ?? '',
      limit: normalizeLimit(params.limit),
      cursor: params.cursor ?? '',
      viewerDid: viewer,
      viewerIsAdmin,
    })
    .catch((err) => {
      if (isDataplaneError(err, Code.PermissionDenied)) {
        throw new InvalidRequestError(
          'Active community membership is required',
          'CommunityMembershipRequired',
        )
      }
      throw err
    })

  const result = {
    members: res.members.map((member) => ({
      did: member.did,
      handle: parseString(member.handle),
      displayName: parseString(member.displayName),
      avatar: parseString(member.avatar),
      membershipState: member.membershipState,
      roles: member.roles.length ? member.roles : undefined,
      joinedAt: member.joinedAt,
      votesCast: member.votesCast,
      delegationsReceived: member.delegationsReceived,
      policyPosts: member.policyPosts,
      matterPosts: member.matterPosts,
    })),
    cursor: parseString(res.cursor),
  }

  if (cache && cacheKey) {
    await cache.set(cacheKey, 'members', result)
  }
  return result
}

const normalizeLimit = (limit: number | undefined) => {
  if (!limit || Number.isNaN(limit)) return 50
  return Math.max(1, Math.min(limit, 100))
}
