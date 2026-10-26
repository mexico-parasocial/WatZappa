import type {
  DatetimeString,
  DidString,
  HandleString,
  UriString,
} from '@atproto/lex'
import { InvalidRequestError, type Server } from '@atproto/xrpc-server'
import type { AppContext } from '../../../../context.js'
import { Code, isDataplaneError } from '../../../../data-plane/index.js'
import { parseString } from '../../../../hydration/util.js'
import { com } from '../../../../lexicons/index.js'
import { resHeaders } from '../../../util.js'
import { parseDataplaneJson } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.add(com.para.civic.listDelegationCandidates, {
    auth: ctx.authVerifier.standardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const result = await listDelegationCandidates({
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

const listDelegationCandidates = async ({
  ctx,
  params,
  viewer,
  viewerIsAdmin,
}: {
  ctx: AppContext
  params: com.para.civic.listDelegationCandidates.$Params
  viewer: string
  viewerIsAdmin: boolean
}): Promise<com.para.civic.listDelegationCandidates.$OutputBody> => {
  const res = await ctx.dataplane
    .getParaDelegationCandidates({
      cabildeoUri: params.cabildeo,
      communityId: params.communityId ?? '',
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

  return {
    candidates: parseDataplaneJson<
      Array<{
        did: DidString
        handle?: HandleString
        displayName?: string
        avatar?: UriString
        description?: string
        roles: string[]
        activeDelegationCount: number
        hasVoted: boolean
        votedAt?: DatetimeString
        selectedOption?: number
      }>
    >(res.candidatesJson, []).map((candidate) => {
      const handle = parseString<HandleString>(candidate.handle)
      const displayName = parseString(candidate.displayName)
      const avatar = parseString<UriString>(candidate.avatar)
      const description = parseString(candidate.description)
      const votedAt = parseString<DatetimeString>(candidate.votedAt)

      return {
        did: candidate.did,
        ...(handle ? { handle } : {}),
        ...(displayName ? { displayName } : {}),
        ...(avatar ? { avatar } : {}),
        ...(description ? { description } : {}),
        roles: candidate.roles,
        activeDelegationCount: candidate.activeDelegationCount,
        hasVoted: candidate.hasVoted,
        ...(votedAt ? { votedAt } : {}),
        ...(typeof candidate.selectedOption === 'number'
          ? { selectedOption: candidate.selectedOption }
          : {}),
      }
    }),
    cursor: parseString(res.cursor),
  }
}

const normalizeLimit = (limit: number | undefined) => {
  if (!limit || Number.isNaN(limit)) return 50
  return Math.max(1, Math.min(limit, 100))
}
