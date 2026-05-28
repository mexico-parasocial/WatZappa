// @ts-nocheck
import { AppContext } from '../../../../context.js'
import { DataPlaneClient } from '../../../../data-plane/index.js'
import { parseString } from '../../../../hydration/util.js'
import { Server } from '../../../../lexicon/index.js'
import { QueryParams } from '../../../../lexicon/types/com/para/community/getGovernance.js'
import { resHeaders } from '../../../util.js'

export default function (server: Server, ctx: AppContext) {
  server.com.para.community.getGovernance({
    auth: ctx.authVerifier.optionalStandardOrRole,
    handler: async ({ params, auth, req }) => {
      const { viewer } = ctx.authVerifier.parseCreds(auth)
      const labelers = ctx.reqLabelers(req)
      const result = await getGovernance({ ctx, params })
      const repoRev = await ctx.hydrator.actor.getRepoRevSafe(viewer)
      return {
        encoding: 'application/json' as const,
        body: result as any,
        headers: resHeaders({ repoRev, labelers }),
      }
    },
  })
}

const getGovernance = async (inputs: { ctx: Context; params: QueryParams }) => {
  const { ctx, params } = inputs
  const res = await ctx.dataplane.getParaCommunityGovernance({
    community: params.community,
    limit: params.limit ?? 50,
  })
  const computedAt = parseString(res.computedAt) ?? new Date().toISOString()

  return {
    source: 'network',
    community: res.community,
    communityId:
      parseString(params.communityId) ||
      normalizeCommunitySlug(res.community || params.community),
    slug: normalizeCommunitySlug(res.community || params.community),
    createdAt: computedAt,
    updatedAt: computedAt,
    moderators: res.moderators.map((moderator) => ({
      did: moderator.member?.did ?? '',
      handle: parseString(moderator.member?.handle),
      displayName: parseString(moderator.member?.displayName),
      avatar: parseString(moderator.member?.avatar),
      role: moderator.role,
      badge: moderator.badge,
      capabilities: [],
    })),
    officials: res.officials.map((official) => ({
      did: official.member?.did ?? '',
      handle: parseString(official.member?.handle),
      displayName: parseString(official.member?.displayName),
      avatar: parseString(official.member?.avatar),
      office: official.office,
      mandate: official.mandate,
    })),
    deputies: res.deputies.map((deputy) => ({
      key: normalizeCommunitySlug(deputy.role || 'deputy-role'),
      tier: deputy.tier,
      role: deputy.role,
      description: 'No public role description yet.',
      capabilities: [],
      activeHolder: {
        did: deputy.activeHolder?.did ?? '',
        handle: parseString(deputy.activeHolder?.handle),
        displayName: parseString(deputy.activeHolder?.displayName),
        avatar: parseString(deputy.activeHolder?.avatar),
      },
      activeSince: undefined,
      votes: deputy.votesBackingRole,
      applicants: deputy.applicants.map((applicant) => ({
        displayName: applicant,
        appliedAt: computedAt,
        status: 'applied',
      })),
    })),
    metadata: res.metadata
      ? {
          termLengthDays: res.metadata.termLengthDays || undefined,
          reviewCadence: parseString(res.metadata.reviewCadence),
          escalationPath: parseString(res.metadata.escalationPath),
          publicContact: parseString(res.metadata.publicContact),
          lastPublishedAt: parseString(res.metadata.lastPublishedAt),
          state: parseString(res.metadata.state),
          matterFlairIds: res.metadata.matterFlairIds.length
            ? res.metadata.matterFlairIds
            : undefined,
          policyFlairIds: res.metadata.policyFlairIds.length
            ? res.metadata.policyFlairIds
            : undefined,
        }
      : undefined,
    editHistory: res.editHistory.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorDid: parseString(entry.actorDid),
      actorHandle: parseString(entry.actorHandle),
      createdAt: parseString(entry.createdAt) || computedAt,
      summary: entry.summary,
    })),
    counters: {
      members: res.summary?.members ?? 0,
      visiblePosters: res.summary?.visiblePosters ?? 0,
      policyPosts: res.summary?.policyPosts ?? 0,
      matterPosts: res.summary?.matterPosts ?? 0,
      badgeHolders: res.summary?.badgeHolders ?? 0,
    },
    summary: {
      members: res.summary?.members ?? 0,
      visiblePosters: res.summary?.visiblePosters ?? 0,
      policyPosts: res.summary?.policyPosts ?? 0,
      matterPosts: res.summary?.matterPosts ?? 0,
      badgeHolders: res.summary?.badgeHolders ?? 0,
    },
    computedAt,
  }
}

const normalizeCommunitySlug = (community: string) =>
  community
    .trim()
    .replace(/^p\//i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

type Context = {
  dataplane: DataPlaneClient
  hydrator: AppContext['hydrator']
}
