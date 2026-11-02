import type {
  AtUriString,
  DatetimeString,
  DidString,
  UriString,
} from '@atproto/lex'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { Code, isDataplaneError } from '../../../../data-plane/index.js'
import { parseString } from '../../../../hydration/util.js'
import { com } from '../../../../lexicons/index.js'
import { resHeaders } from '../../../util.js'

/*
 * Who in one community voted on a policy, and how. The ballots are public
 * records, so this reveals nothing the firehose does not; it is gated to the
 * community's own members because it is "my community" view, and so that a
 * list of a community's voters is not one anonymous request away.
 */
export default function (server: Server, ctx: AppContext) {
  server.add(com.para.civic.getPolicyCommunityVotes, {
    auth: ctx.authVerifier.standardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const res = await ctx.dataplane
        .getParaPolicyCommunityVotes({
          postUri: params.post,
          communityId: params.community,
          viewerDid: viewer ?? '',
          viewerIsAdmin:
            auth.credentials.type === 'role' && auth.credentials.admin,
          limit: normalizeLimit(params.limit),
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

      if (!res.communityUri) {
        throw new InvalidRequestError('Community not found', 'NotFound')
      }

      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json',
        body: {
          community: {
            uri: res.communityUri as AtUriString,
            name: res.communityName,
          },
          memberCount: res.memberCount,
          voterCount: res.voterCount,
          signalAverage: formatSignalAverage(res.signalAverage),
          breakdown: res.breakdown.map((bucket) => ({
            signal: bucket.signal,
            count: bucket.count,
          })),
          votes: res.votes.map((vote) => ({
            did: vote.did as DidString,
            handle: parseString(vote.handle),
            displayName: parseString(vote.displayName),
            avatar: parseString(vote.avatar) as UriString | undefined,
            signal: vote.signal,
            createdAt: vote.createdAt as DatetimeString,
          })),
        },
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

const normalizeLimit = (limit: number | undefined) => {
  if (!limit || Number.isNaN(limit)) return 50
  return Math.max(1, Math.min(limit, 100))
}

const formatSignalAverage = (value: number | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0'
  return value.toFixed(4).replace(/\.?0+$/, '') || '0'
}
