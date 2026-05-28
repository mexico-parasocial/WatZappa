// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { Code, isDataplaneError } from '../../../../data-plane/index.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/civic/listDelegationCandidates.js'
import { resHeaders } from '../../../util.js'
import { parseDataplaneJson } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.civic.listDelegationCandidates({
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
  params: QueryParams
  viewer: string
  viewerIsAdmin: boolean
}) => {
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
        did: string
        handle?: string
        displayName?: string
        avatar?: string
        description?: string
        roles: string[]
        activeDelegationCount: number
        hasVoted: boolean
        votedAt?: string
        selectedOption?: number
      }>
    >(res.candidatesJson, []).map((candidate) => {
      const handle = parseString(candidate.handle)
      const displayName = parseString(candidate.displayName)
      const avatar = parseString(candidate.avatar)
      const description = parseString(candidate.description)
      const votedAt = parseString(candidate.votedAt)

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
