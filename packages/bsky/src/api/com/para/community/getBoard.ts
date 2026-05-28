// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/community/getBoard.js'
import { resHeaders } from '../../../util.js'

const CREATE_COMMUNITY_CAPABILITY = 'create_community'
const JOIN_COMMUNITY_CAPABILITY = 'join_community'
const LEAVE_COMMUNITY_CAPABILITY = 'leave_community'
const MANAGE_GOVERNANCE_CAPABILITY = 'manage_governance'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.getBoard({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const result = await getBoard({
        ctx,
        params,
        viewer: viewer ?? undefined,
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

const getBoard = async ({
  ctx,
  params,
  viewer,
}: {
  ctx: AppContext
  params: QueryParams
  viewer?: string
}) => {
  console.log('[getBoard API] Incoming params:', params, 'viewer:', viewer)
  try {
    const res = await ctx.dataplane.getParaCommunityBoard({
      communityId: params.communityId ?? '',
      uri: params.uri ?? '',
      viewerDid: viewer ?? '',
    })

    console.log(
      '[getBoard API] Dataplane response received. Board present?',
      !!res?.board,
    )

    if (!res.board) {
      console.warn(
        '[getBoard API] Dataplane returned no board. Throwing NotFound.',
      )
      throw new InvalidRequestError('Community not found', 'NotFound')
    }

    const board = mapBoardView(res.board, res.governanceSummary)
    console.log(
      '[getBoard API] Successfully mapped board view for:',
      board.slug || board.communityId,
    )

    return {
      board,
      viewerCapabilities: getViewerCapabilities({
        viewer,
        creatorDid: res.board.creatorDid,
        viewerRoles: res.board.viewerRoles,
        viewerMembershipState: res.board.viewerMembershipState || 'none',
        canCreateCommunity: true,
      }),
    }
  } catch (err) {
    console.error('[getBoard API] FATAL ERROR during getBoard execution:', err)
    throw err
  }
}

const mapBoardView = (
  board: NonNullable<
    Awaited<
      ReturnType<AppContext['dataplane']['getParaCommunityBoard']>
    >['board']
  >,
  governanceSummary?: Awaited<
    ReturnType<AppContext['dataplane']['getParaCommunityBoard']>
  >['governanceSummary'],
) => ({
  uri: board.uri,
  cid: board.cid,
  creatorDid: board.creatorDid,
  creatorHandle: parseString(board.creatorHandle),
  creatorDisplayName: parseString(board.creatorDisplayName),
  communityId: board.communityId,
  slug: board.slug,
  name: board.name,
  description: parseString(board.description),
  quadrant: board.quadrant,
  delegatesChatId: board.delegatesChatId,
  subdelegatesChatId: board.subdelegatesChatId,
  memberCount: board.memberCount,
  viewerMembershipState: (parseString(board.viewerMembershipState) ??
    'none') as 'none' | 'pending' | 'active' | 'left' | 'removed' | 'blocked',
  viewerRoles: board.viewerRoles.length ? board.viewerRoles : undefined,
  status: parseString((board as { status?: string }).status) as
    | 'draft'
    | 'active'
    | undefined,
  founderStarterPackUri: parseString(
    (board as { founderStarterPackUri?: string }).founderStarterPackUri,
  ),
  createdAt: board.createdAt,
  governanceSummary: governanceSummary
    ? {
        moderatorCount: governanceSummary.moderatorCount,
        officialCount: governanceSummary.officialCount,
        deputyRoleCount: governanceSummary.deputyRoleCount,
        lastPublishedAt: parseString(governanceSummary.lastPublishedAt),
      }
    : undefined,
})

const getViewerCapabilities = ({
  viewer,
  creatorDid,
  viewerRoles,
  viewerMembershipState,
  canCreateCommunity,
}: {
  viewer?: string
  creatorDid: string
  viewerRoles: string[]
  viewerMembershipState: string
  canCreateCommunity: boolean
}) => {
  const capabilities: string[] = []

  if (canCreateCommunity) {
    capabilities.push(CREATE_COMMUNITY_CAPABILITY)
  }

  if (
    viewer &&
    (viewerMembershipState === 'none' || viewerMembershipState === 'left')
  ) {
    capabilities.push(JOIN_COMMUNITY_CAPABILITY)
  }

  if (viewer && viewerMembershipState === 'active') {
    capabilities.push(LEAVE_COMMUNITY_CAPABILITY)
  }

  if (
    viewer &&
    (viewer === creatorDid ||
      viewerRoles.includes('owner') ||
      viewerRoles.includes('moderator'))
  ) {
    capabilities.push(MANAGE_GOVERNANCE_CAPABILITY)
  }

  return capabilities
}
