// @ts-nocheck
import { InvalidRequestError } from '@atproto/xrpc-server'
import { AppContext } from '../../../../context.js'
import { parseCid, parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/civic/getCabildeo.js'
import { resHeaders } from '../../../util.js'
import { getVisibleParticipantDids, parseDataplaneJson } from './util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.civic.getCabildeo({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const result = await getCabildeo({
        ctx,
        params,
        viewer: viewer ?? undefined,
        labelers,
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

const getCabildeo = async (inputs: {
  ctx: AppContext
  params: QueryParams
  viewer?: string
  labelers: ReturnType<AppContext['reqLabelers']>
}) => {
  const { ctx, params, viewer, labelers } = inputs
  const res = await ctx.dataplane.getParaCabildeo({
    cabildeoUri: params.cabildeo,
    viewerDid: viewer ?? '',
  })

  const cabildeoView = parseDataplaneJson<
    Parameters<typeof mapCabildeoView>[0] | undefined
  >(res.cabildeoJson, undefined)

  if (!cabildeoView) {
    throw new InvalidRequestError('Cabildeo not found', 'NotFound')
  }

  const cabildeo = mapCabildeoView(cabildeoView)
  const visiblePreviewDids = await getVisibleParticipantDids({
    ctx,
    dids: cabildeo.liveSession?.participantPreviewDids ?? [],
    viewer,
    labelers,
  })

  return {
    cabildeo: {
      ...cabildeo,
      liveSession: cabildeo.liveSession
        ? {
            ...cabildeo.liveSession,
            participantPreviewDids:
              cabildeo.liveSession.participantPreviewDids.filter((did) =>
                visiblePreviewDids.has(did),
              ),
          }
        : undefined,
    },
  }
}

const mapCabildeoView = (view: {
  uri: string
  cid: string
  creator: string
  indexedAt: string
  title: string
  description: string
  community: string
  communities: string[]
  flairs: string[]
  region: string
  geoRestricted: boolean
  options: Array<{ label: string; description: string; isConsensus: boolean }>
  minQuorum?: number
  voteVisibility?: string
  phase: string
  phaseDeadline: string
  createdAt: string
  optionSummary: Array<{
    optionIndex: number
    label: string
    votes: number
    positions: number
  }>
  positionCounts?: {
    total: number
    forCount: number
    againstCount: number
    amendmentCount: number
    byOption: Array<{
      optionIndex: number
      label: string
      votes: number
      positions: number
    }>
  }
  voteTotals?: {
    total: number
    direct: number
    delegated: number
  }
  partyVoteSummary?: Array<{
    party: string
    total: number
    byOption: number[]
  }>
  outcomeSummary?: {
    winningOption?: number
    totalParticipants: number
    effectiveTotalPower: number
    tie: boolean
    breakdown: Array<{
      optionIndex: number
      label: string
      votes: number
      positions: number
    }>
  }
  viewerContext?: {
    currentVoteOption?: number
    currentVoteIsDirect: boolean
    currentVoteCreatedAt?: string
    activeDelegation: string
    delegateHasVoted: boolean
    delegatedVoteOption?: number
    delegatedVotedAt: string
    gracePeriodEndsAt: string
    delegateVoteDismissed: boolean
  }
  liveSession?: {
    isLive: boolean
    hostDid: string
    activeParticipantCount: number
    startedAt: string
    participantPreviewDids: string[]
  }
}) => ({
  uri: view.uri,
  cid: parseCidOrThrow(view.cid),
  creator: view.creator,
  indexedAt: view.indexedAt,
  title: view.title,
  description: view.description,
  community: view.community,
  communities: view.communities.length ? view.communities : undefined,
  flairs: view.flairs.length ? view.flairs : undefined,
  region: parseString(view.region),
  geoRestricted: view.geoRestricted,
  options: view.options.map((option) => ({
    label: option.label,
    description: parseString(option.description),
    isConsensus: option.isConsensus,
  })),
  minQuorum: view.minQuorum,
  voteVisibility: view.voteVisibility || 'public',
  phase: view.phase,
  phaseDeadline: parseString(view.phaseDeadline),
  createdAt: view.createdAt,
  optionSummary: view.optionSummary,
  positionCounts: {
    total: view.positionCounts?.total ?? 0,
    for: view.positionCounts?.forCount ?? 0,
    against: view.positionCounts?.againstCount ?? 0,
    amendment: view.positionCounts?.amendmentCount ?? 0,
    byOption: view.positionCounts?.byOption ?? [],
  },
  voteTotals: {
    total: view.voteTotals?.total ?? 0,
    direct: view.voteTotals?.direct ?? 0,
    delegated: view.voteTotals?.delegated ?? 0,
  },
  partyVoteSummary: view.partyVoteSummary,
  outcomeSummary: view.outcomeSummary
    ? {
        winningOption: view.outcomeSummary.winningOption,
        totalParticipants: view.outcomeSummary.totalParticipants,
        effectiveTotalPower: view.outcomeSummary.effectiveTotalPower,
        tie: view.outcomeSummary.tie,
        breakdown: view.outcomeSummary.breakdown,
      }
    : undefined,
  viewerContext: view.viewerContext
    ? {
        currentVoteOption: view.viewerContext.currentVoteOption,
        currentVoteIsDirect: view.viewerContext.currentVoteIsDirect,
        currentVoteCreatedAt: parseString(
          view.viewerContext.currentVoteCreatedAt,
        ),
        activeDelegation: parseString(view.viewerContext.activeDelegation),
        delegateHasVoted: view.viewerContext.delegateHasVoted,
        delegatedVoteOption: view.viewerContext.delegatedVoteOption,
        delegatedVotedAt: parseString(view.viewerContext.delegatedVotedAt),
        gracePeriodEndsAt: parseString(view.viewerContext.gracePeriodEndsAt),
        delegateVoteDismissed: view.viewerContext.delegateVoteDismissed,
      }
    : undefined,
  liveSession: view.liveSession
    ? {
        isLive: view.liveSession.isLive,
        hostDid: view.liveSession.hostDid,
        activeParticipantCount: view.liveSession.activeParticipantCount,
        startedAt: view.liveSession.startedAt,
        participantPreviewDids: view.liveSession.participantPreviewDids,
      }
    : undefined,
})

const parseCidOrThrow = (cidStr: string) => {
  const cid = parseCid(cidStr)
  if (!cid) {
    throw new Error(`Invalid CID in cabildeo view: ${cidStr}`)
  }
  return cid
}
