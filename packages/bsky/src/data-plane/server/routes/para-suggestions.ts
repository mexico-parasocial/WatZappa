import { ServiceImpl } from '@connectrpc/connect'
import { sql } from 'kysely'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'

const PARA_CIVIC_SUBTAGS: Record<string, string[]> = {
  'public-services': [
    'healthcare',
    'education',
    'infrastructure',
    'public-transport',
    'water-sanitation',
  ],
  'internal-revenue': [
    'tax-reform',
    'fiscal-transparency',
    'public-debt',
    'audit-accountability',
    'tax-evasion',
  ],
  economy: [
    'employment',
    'inflation',
    'trade-policy',
    'minimum-wage',
    'small-business',
  ],
  'internal-affairs': [
    'security',
    'justice-reform',
    'corruption',
    'civil-rights',
    'indigenous-rights',
  ],
  'external-affairs': [
    'diplomacy',
    'migration',
    'trade-agreements',
    'border-policy',
    'international-aid',
  ],
  'social-issues': [
    'gender-equality',
    'lgbtq-rights',
    'disability-rights',
    'housing',
    'environmental-justice',
  ],
}

type Compass = {x: number; y: number; ninth?: string} | null

const parseCompass = (raw: string | null | undefined): Compass => {
  if (!raw) return null
  try {
    const c = JSON.parse(raw)
    if (c && typeof c.x === 'number' && typeof c.y === 'number') {
      return {x: c.x, y: c.y, ninth: c.ninth}
    }
  } catch {}
  return null
}

const compassDistance = (a: Compass, b: Compass): number => {
  if (!a || !b) return 0.7
  const dx = a.x - b.x
  const dy = a.y - b.y
  // Max euclidean distance in a [-1,1]² space is √2 ≈ 1.414
  return Math.min(1, Math.sqrt(dx * dx + dy * dy) / 1.414)
}

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaSuggestedUsers(req) {
    const viewerDid = req.viewerDid || ''
    const limit = Math.min(Math.max(req.limit || 25, 1), 100)

    const subTags: string[] = []
    if (req.category && PARA_CIVIC_SUBTAGS[req.category]) {
      subTags.push(...PARA_CIVIC_SUBTAGS[req.category])
    }
    if (req.interests?.length) {
      subTags.push(...req.interests)
    }

    // 1. Viewer's compass
    let viewerCompass: Compass = null
    if (viewerDid) {
      const viewerAssessment = await db.db
        .selectFrom('raq_assessment')
        .where('creator', '=', viewerDid)
        .where('isPublic', '=', true)
        .orderBy('completedAt', 'desc')
        .select('compassJson')
        .executeTakeFirst()
      viewerCompass = parseCompass(viewerAssessment?.compassJson)
    }

    // 2. Viewer's community memberships (for overlap scoring)
    const viewerCommunityUris: string[] = []
    if (viewerDid) {
      const rows = await db.db
        .selectFrom('para_community_membership')
        .where('creator', '=', viewerDid)
        .where('membershipState', '=', 'active')
        .select('communityUri')
        .execute()
      for (const r of rows) viewerCommunityUris.push(r.communityUri)
    }

    // 3. Follows to exclude (people viewer already follows)
    const followedDids: string[] = []
    if (viewerDid) {
      const rows = await db.db
        .selectFrom('follow')
        .where('creator', '=', viewerDid)
        .select('subjectDid')
        .execute()
      for (const r of rows) followedDids.push(r.subjectDid)
    }

    // 4. Topical candidate set
    const topicalCandidates: {did: string; postCount: number}[] = []
    if (subTags.length > 0) {
      const rows = await db.db
        .selectFrom('para_post_meta')
        .where(
          sql<boolean>`"para_post_meta"."tags" ?& ${JSON.stringify(subTags)}`,
        )
        .where('createdAt', '>=', sql<string>`now() - interval '30 days'`)
        .select(['creator as did', sql<number>`count(*)::int`.as('postCount')])
        .groupBy('creator')
        .orderBy('postCount', 'desc')
        .limit(200)
        .execute()
      for (const r of rows) {
        topicalCandidates.push({did: r.did, postCount: Number(r.postCount)})
      }
    }

    // 5. Discover-by-compass candidates
    const compassCandidates: {did: string; compassJson: string | null}[] = []
    if (subTags.length === 0 || topicalCandidates.length < limit) {
      const rows = await db.db
        .selectFrom('raq_assessment as a')
        .where('a.isPublic', '=', true)
        .where('a.creator', '!=', viewerDid || sql<string>`''`)
        .orderBy('a.completedAt', 'desc')
        .select(['a.creator as did', 'a.compassJson'])
        .limit(200)
        .execute()
      for (const r of rows) compassCandidates.push(r)
    }

    // 6. Merge candidates
    const allDids = new Set<string>()
    for (const c of topicalCandidates) allDids.add(c.did)
    for (const c of compassCandidates) allDids.add(c.did)

    // 7. Score each candidate
    const communityOverlapByDid = new Map<string, number>()
    if (viewerCommunityUris.length > 0) {
      const overlapRows = await db.db
        .selectFrom('para_community_membership')
        .where('communityUri', 'in', viewerCommunityUris)
        .where('membershipState', '=', 'active')
        .select('creator')
        .execute()
      for (const r of overlapRows) {
        communityOverlapByDid.set(
          r.creator,
          (communityOverlapByDid.get(r.creator) ?? 0) + 1,
        )
      }
    }

    const followersByDid = new Map<string, number>()
    if (allDids.size > 0) {
      const dids = Array.from(allDids)
      const profileRows = await db.db
        .selectFrom('profile_agg')
        .where('did', 'in', dids)
        .select(['did', 'followersCount'])
        .execute()
      for (const r of profileRows) {
        followersByDid.set(r.did, Number(r.followersCount))
      }
    }

    const compassByDid = new Map<string, Compass>()
    for (const c of compassCandidates) {
      compassByDid.set(c.did, parseCompass(c.compassJson))
    }

    const excludeSet = new Set<string>(followedDids)
    if (viewerDid) excludeSet.add(viewerDid)

    const scored: Array<{
      did: string
      postCount: number
      overlap: number
      followers: number
      compassTerm: number
      score: number
    }> = []
    for (const did of allDids) {
      if (excludeSet.has(did)) continue
      const postCount =
        topicalCandidates.find(c => c.did === did)?.postCount ?? 0
      const overlap = communityOverlapByDid.get(did) ?? 0
      const followers = followersByDid.get(did) ?? 0
      const distance = compassDistance(viewerCompass, compassByDid.get(did) ?? null)
      const compassTerm = 1 - distance
      const score =
        3 * postCount + 2 * overlap + 1 * compassTerm + 0.5 * Math.log1p(followers)
      if (score <= 0 && subTags.length > 0) continue
      scored.push({did, postCount, overlap, followers, compassTerm, score})
    }

    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, limit)

    if (top.length === 0) {
      return {candidates: [], cursor: ''}
    }

    // 8. Fetch follower counts (single batched query)
    const dids = top.map(c => c.did)
    const profileRows = await db.db
      .selectFrom('profile_agg')
      .where('did', 'in', dids)
      .select(['did', 'followersCount'])
      .execute()
    const followersByDid2 = new Map(
      profileRows.map(r => [r.did, Number(r.followersCount)]),
    )

    const candidates = top.map(c => ({
      did: c.did,
      followersCount: followersByDid2.get(c.did) ?? c.followers,
      score: c.score,
    }))

    return {candidates, cursor: ''}
  },
})
