import { Code, ConnectError, ServiceImpl } from '@connectrpc/connect'
import { Service } from '../../../proto/bsky_connect.js'
import { Database } from '../db/index.js'
import { tableName as cardTableName } from '../db/tables/para-community-civic-tree-card.js'
import { tableName as voteTableName } from '../db/tables/para-community-civic-tree-contribution-vote.js'
import { tableName as contributionTableName } from '../db/tables/para-community-civic-tree-contribution.js'
import { tableName as relationshipTableName } from '../db/tables/para-community-civic-tree-relationship.js'

/*
 * Votes needed to settle a contribution under `votes_sortition`. Small on
 * purpose: a community civic tree is worthless while empty, and a review queue
 * that never clears is the failure mode that keeps it empty.
 */
const APPROVAL_THRESHOLD = 3

/** Roles that may settle a contribution on their own under `moderator_gate`. */
const MODERATOR_ROLES = new Set(['moderator', 'admin', 'creator'])

type MembershipRow = {
  membershipState: string
  roles: string[] | null
}

const now = () => new Date().toISOString()

const randomId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

const getMembership = async (
  db: Database,
  communityUri: string,
  did: string,
): Promise<MembershipRow | undefined> => {
  if (!did) return undefined
  const row = await db.db
    .selectFrom('para_community_membership')
    .select(['membershipState', 'roles'])
    .where('communityUri', '=', communityUri)
    .where('creator', '=', did)
    .executeTakeFirst()
  return row as MembershipRow | undefined
}

const isActiveMember = (membership?: MembershipRow) =>
  membership?.membershipState === 'active'

const isModerator = (membership?: MembershipRow) =>
  (membership?.roles ?? []).some((role) => MODERATOR_ROLES.has(role))

/**
 * Shapes a contribution row for the wire, adding the viewer's own vote. Field
 * names are snake_case because the client consumes this JSON directly.
 */
const toContributionView = (
  row: Record<string, unknown>,
  viewerVote?: string,
) => ({
  id: row.id,
  community_uri: row.communityUri,
  author_did: row.authorDid,
  title: row.title,
  content: row.content ?? null,
  source_uri: row.sourceUri ?? null,
  source_url: row.sourceUrl ?? null,
  source_type: row.sourceType,
  metadata: row.metadata ?? null,
  status: row.status,
  approved_card_id: row.approvedCardId ?? null,
  created_at: row.createdAt,
  decided_at: row.decidedAt ?? null,
  approve_count: Number(row.approveCount ?? 0),
  reject_count: Number(row.rejectCount ?? 0),
  ...(viewerVote ? { viewer_vote: viewerVote } : {}),
})

export default (db: Database): Partial<ServiceImpl<typeof Service>> => ({
  async getParaCommunityCivicTreeGraph(req) {
    const cards = await db.db
      .selectFrom(cardTableName)
      .selectAll()
      .where('communityUri', '=', req.communityUri)
      .orderBy('createdAt', 'asc')
      .execute()

    const edges = await db.db
      .selectFrom(relationshipTableName)
      .selectAll()
      .where('communityUri', '=', req.communityUri)
      .orderBy('createdAt', 'asc')
      .execute()

    const cardIds = new Set(cards.map((card) => card.id))

    const nodes = cards.map((card) => ({
      id: card.id,
      title: card.title,
      card_type: card.cardType,
      author_did: card.authorDid,
      community_uri: card.communityUri,
      influence: card.influence,
      vote_count: card.voteCount,
      stance: card.stance ?? undefined,
      compass_quadrant: card.compassQuadrant ?? undefined,
      content: card.content ?? null,
      source_url: card.sourceUrl ?? null,
      metadata: card.metadata ?? null,
    }))

    /*
     * An edge whose endpoints are not both present would render as a dangling
     * line, so drop it here rather than making every consumer defend itself.
     */
    const graphEdges = edges
      .filter(
        (edge) =>
          cardIds.has(edge.sourceCardId) && cardIds.has(edge.targetCardId),
      )
      .map((edge) => ({
        id: edge.id,
        source: edge.sourceCardId,
        target: edge.targetCardId,
        relationship_type: edge.relationshipType,
      }))

    return {
      nodesJson: JSON.stringify(nodes),
      edgesJson: JSON.stringify(graphEdges),
    }
  },

  async submitParaCommunityCivicTreeContribution(req) {
    const board = await db.db
      .selectFrom('para_community_board')
      .select(['uri'])
      .where('uri', '=', req.communityUri)
      .executeTakeFirst()
    if (!board) {
      throw new ConnectError('CommunityNotFound', Code.NotFound)
    }

    const membership = await getMembership(db, req.communityUri, req.authorDid)
    if (!isActiveMember(membership)) {
      throw new ConnectError('NotAMember', Code.PermissionDenied)
    }

    const timestamp = now()
    const row = {
      id: randomId(),
      communityUri: req.communityUri,
      authorDid: req.authorDid,
      title: req.title,
      content: req.content || null,
      sourceUri: req.sourceUri || null,
      sourceUrl: req.sourceUrl || null,
      sourceType: req.sourceType,
      metadata: req.metadata || null,
      status: 'pending',
      approvedCardId: null,
      approveCount: 0,
      rejectCount: 0,
      createdAt: timestamp,
      decidedAt: null,
      indexedAt: timestamp,
    }

    await db.db.insertInto(contributionTableName).values(row).execute()

    return { contributionJson: JSON.stringify(toContributionView(row)) }
  },

  async getParaCommunityCivicTreeContributions(req) {
    let builder = db.db
      .selectFrom(contributionTableName)
      .selectAll()
      .where('communityUri', '=', req.communityUri)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(req.limit || 50)

    if (req.status) {
      builder = builder.where('status', '=', req.status)
    }

    if (req.cursor) {
      builder = builder.where('createdAt', '<', req.cursor)
    }

    const rows = await builder.execute()

    /*
     * One batched lookup for the viewer's votes rather than a join, so the
     * anonymous case costs nothing.
     */
    const viewerVotes = new Map<string, string>()
    if (req.viewerDid && rows.length > 0) {
      const voteRows = await db.db
        .selectFrom(voteTableName)
        .select(['contributionId', 'vote'])
        .where('voterDid', '=', req.viewerDid)
        .where(
          'contributionId',
          'in',
          rows.map((row) => row.id),
        )
        .execute()
      for (const vote of voteRows) {
        viewerVotes.set(vote.contributionId, vote.vote)
      }
    }

    const items = rows.map((row) =>
      toContributionView(row, viewerVotes.get(row.id)),
    )

    return {
      itemsJson: JSON.stringify(items),
      cursor: rows.length > 0 ? rows[rows.length - 1].createdAt : '',
    }
  },

  async voteParaCommunityCivicTreeContribution(req) {
    return db.transaction(async (txn) => {
      const contribution = await txn.db
        .selectFrom(contributionTableName)
        .selectAll()
        .where('id', '=', req.contributionId)
        .executeTakeFirst()
      if (!contribution) {
        throw new ConnectError('ContributionNotFound', Code.NotFound)
      }
      if (contribution.status !== 'pending') {
        throw new ConnectError('AlreadyDecided', Code.FailedPrecondition)
      }
      if (contribution.authorDid === req.voterDid) {
        throw new ConnectError('SelfVote', Code.PermissionDenied)
      }

      const membership = await getMembership(
        txn,
        contribution.communityUri,
        req.voterDid,
      )
      if (!isActiveMember(membership)) {
        throw new ConnectError('NotAMember', Code.PermissionDenied)
      }

      const board = await txn.db
        .selectFrom('para_community_board')
        .select(['governanceMode'])
        .where('uri', '=', contribution.communityUri)
        .executeTakeFirst()
      const governanceMode = board?.governanceMode || 'votes_sortition'

      if (governanceMode === 'moderator_gate' && !isModerator(membership)) {
        throw new ConnectError('NotAMember', Code.PermissionDenied)
      }

      const timestamp = now()

      /*
       * Changing a vote replaces it, so the denormalized counts are recomputed
       * from the vote table rather than incremented.
       */
      await txn.db
        .insertInto(voteTableName)
        .values({
          contributionId: req.contributionId,
          voterDid: req.voterDid,
          vote: req.vote,
          createdAt: timestamp,
          indexedAt: timestamp,
        })
        .onConflict((oc) =>
          oc.columns(['contributionId', 'voterDid']).doUpdateSet({
            vote: req.vote,
            indexedAt: timestamp,
          }),
        )
        .execute()

      const tallies = await txn.db
        .selectFrom(voteTableName)
        .select(['vote'])
        .where('contributionId', '=', req.contributionId)
        .execute()

      const approveCount = tallies.filter((t) => t.vote === 'approve').length
      const rejectCount = tallies.filter((t) => t.vote === 'reject').length

      const threshold =
        governanceMode === 'moderator_gate' ? 1 : APPROVAL_THRESHOLD

      let status = 'pending'
      if (approveCount >= threshold && approveCount > rejectCount) {
        status = 'approved'
      } else if (rejectCount >= threshold && rejectCount >= approveCount) {
        status = 'rejected'
      }

      let approvedCardId: string | null = null
      if (status === 'approved') {
        approvedCardId = randomId()
        await txn.db
          .insertInto(cardTableName)
          .values({
            id: approvedCardId,
            communityUri: contribution.communityUri,
            authorDid: contribution.authorDid,
            cardType: contribution.sourceType,
            title: contribution.title,
            content: contribution.content,
            sourceUri: contribution.sourceUri,
            sourceUrl: contribution.sourceUrl,
            metadata: contribution.metadata,
            stance: null,
            compassQuadrant: null,
            influence: 0,
            voteCount: approveCount + rejectCount,
            contributionId: contribution.id,
            createdAt: timestamp,
            indexedAt: timestamp,
          })
          .execute()
      }

      const updated = {
        ...contribution,
        status,
        approvedCardId,
        approveCount,
        rejectCount,
        decidedAt: status === 'pending' ? null : timestamp,
      }

      await txn.db
        .updateTable(contributionTableName)
        .set({
          status: updated.status,
          approvedCardId: updated.approvedCardId,
          approveCount: updated.approveCount,
          rejectCount: updated.rejectCount,
          decidedAt: updated.decidedAt,
        })
        .where('id', '=', req.contributionId)
        .execute()

      return {
        contributionJson: JSON.stringify(
          toContributionView(updated, req.vote),
        ),
      }
    })
  },
})
