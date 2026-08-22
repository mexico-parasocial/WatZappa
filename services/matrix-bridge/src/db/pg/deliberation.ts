import { randomUUID } from 'node:crypto'
import { decideContribution } from '../../contributions.js'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { MatrixEventsArea } from './matrix-events.js'

export class DeliberationArea extends MatrixEventsArea {


  // Community map contributions
  async insertCommunityMapContribution(contribution: {
    id: string
    communityUri: string
    authorDid: string
    title: string
    content?: string
    sourceUrl?: string
    sourceType: string
    metadata?: string
  }): Promise<void> {
    await this.run(
      'INSERT INTO community_map_contributions (id, community_uri, author_did, title, content, source_url, source_type, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        contribution.id,
        contribution.communityUri,
        contribution.authorDid,
        contribution.title,
        contribution.content ?? null,
        contribution.sourceUrl ?? null,
        contribution.sourceType,
        contribution.metadata ?? null,
      ],
    )
  }


  async getCommunityMapContributions(
    communityUri: string,
    opts: { status?: string; viewerDid?: string; limit?: number } = {},
  ): Promise<any[]> {
    let sql =
      'SELECT * FROM community_map_contributions WHERE community_uri = $1'
    const params: (string | number)[] = [communityUri]
    let idx = 2
    if (opts.status) {
      sql += ` AND status = $${idx++}`
      params.push(opts.status)
    }
    sql += ' ORDER BY created_at DESC'
    if (opts.limit) {
      sql += ` LIMIT $${idx++}`
      params.push(opts.limit)
    }
    const rows = await this.queryAll(sql, params)
    return Promise.all(
      rows.map(async (row) => {
        const counts = await this.getCommunityContributionVoteCounts(row.id)
        const viewerVote = opts.viewerDid
          ? await this.getCommunityContributionVote(row.id, opts.viewerDid)
          : undefined
        return {
          ...row,
          approve_count: counts.approve,
          reject_count: counts.reject,
          viewer_vote: viewerVote?.vote,
        }
      }),
    )
  }


  async getCommunityMapContribution(
    id: string,
    viewerDid?: string,
  ): Promise<any | undefined> {
    const row = await this.queryOne(
      'SELECT * FROM community_map_contributions WHERE id = $1',
      [id],
    )
    if (!row) return undefined
    const counts = await this.getCommunityContributionVoteCounts(id)
    const viewerVote = viewerDid
      ? await this.getCommunityContributionVote(id, viewerDid)
      : undefined
    return {
      ...row,
      approve_count: counts.approve,
      reject_count: counts.reject,
      viewer_vote: viewerVote?.vote,
    }
  }


  async getCommunityContributionVote(
    contributionId: string,
    voterDid: string,
  ): Promise<{ vote: string } | undefined> {
    return this.queryOne(
      'SELECT vote FROM community_map_contribution_votes WHERE contribution_id = $1 AND voter_did = $2',
      [contributionId, voterDid],
    )
  }


  async getCommunityContributionVoteCounts(
    contributionId: string,
  ): Promise<{ approve: number; reject: number }> {
    const rows = await this.queryAll<{ vote: string; count: number }>(
      'SELECT vote, COUNT(*) as count FROM community_map_contribution_votes WHERE contribution_id = $1 GROUP BY vote',
      [contributionId],
    )
    return {
      approve: rows.find((r) => r.vote === 'approve')?.count ?? 0,
      reject: rows.find((r) => r.vote === 'reject')?.count ?? 0,
    }
  }


  async voteCommunityMapContribution(
    contributionId: string,
    voterDid: string,
    vote: 'approve' | 'reject',
  ): Promise<any> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const existing = await client.query<{ status: string }>(
        'SELECT status FROM community_map_contributions WHERE id = $1',
        [contributionId],
      )
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK')
        throw new Error('Contribution not found')
      }
      if (existing.rows[0].status !== 'pending') {
        const row = await this.queryOne(
          'SELECT * FROM community_map_contributions WHERE id = $1',
          [contributionId],
        )
        await client.query('COMMIT')
        return row
      }

      await client.query(
        `INSERT INTO community_map_contribution_votes (contribution_id, voter_did, vote, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (contribution_id, voter_did) DO UPDATE SET vote = EXCLUDED.vote`,
        [contributionId, voterDid, vote],
      )

      const counts =
        await this.getCommunityContributionVoteCounts(contributionId)
      const decision = decideContribution(counts)

      if (decision === 'approve') {
        const { randomUUID } = await import('node:crypto')
        const cardId = randomUUID()
        await client.query(
          `INSERT INTO deliberation_cards (id, community_uri, author_did, title, content, card_type, source_url, is_public, passport_visible, metadata, extracted_at)
           SELECT $1, community_uri, author_did, title, content, source_type, source_url, 1, 1, metadata, NOW()
           FROM community_map_contributions WHERE id = $2`,
          [cardId, contributionId],
        )
        await client.query(
          "UPDATE community_map_contributions SET status = 'approved', approved_card_id = $1, decided_at = NOW() WHERE id = $2",
          [cardId, contributionId],
        )
      } else if (decision === 'reject') {
        await client.query(
          "UPDATE community_map_contributions SET status = 'rejected', decided_at = NOW() WHERE id = $1",
          [contributionId],
        )
      }

      await client.query('COMMIT')
      return this.getCommunityMapContribution(contributionId, voterDid)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }


  // ── Deliberation Cards ──

  async insertCard(card: {
    id: string
    communityUri: string
    authorDid: string
    title: string
    content?: string
    cardType: string
    sourceRoomId?: string
    sourceEventId?: string
    sourceUrl?: string
    isPublic?: number
    passportVisible?: number
    metadata?: string
  }): Promise<void> {
    await this.run(
      'INSERT INTO deliberation_cards (id, community_uri, author_did, title, content, card_type, source_room_id, source_event_id, source_url, is_public, passport_visible, metadata, extracted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())',
      [
        card.id,
        card.communityUri,
        card.authorDid,
        card.title,
        card.content ?? null,
        card.cardType,
        card.sourceRoomId ?? null,
        card.sourceEventId ?? null,
        card.sourceUrl ?? null,
        card.isPublic ?? 0,
        card.passportVisible ?? 0,
        card.metadata ?? null,
      ],
    )
  }


  async getCardsForCommunity(
    communityUri: string,
    opts: {
      limit?: number
      offset?: number
      cardType?: string
      authorDid?: string
    } = {},
  ): Promise<any[]> {
    let sql = 'SELECT * FROM deliberation_cards WHERE community_uri = $1'
    const params: (string | number)[] = [communityUri]
    let idx = 2
    if (opts.cardType) {
      sql += ` AND card_type = $${idx++}`
      params.push(opts.cardType)
    }
    if (opts.authorDid) {
      sql += ` AND author_did = $${idx++}`
      params.push(opts.authorDid)
    }
    sql += ' ORDER BY extracted_at DESC'
    if (opts.limit) {
      sql += ` LIMIT $${idx++}`
      params.push(opts.limit)
    }
    if (opts.offset) {
      sql += ` OFFSET $${idx++}`
      params.push(opts.offset)
    }
    return this.queryAll(sql, params)
  }


  async getCard(id: string): Promise<any | undefined> {
    return this.queryOne('SELECT * FROM deliberation_cards WHERE id = $1', [id])
  }


  async getCardCount(communityUri: string): Promise<number> {
    const row = await this.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM deliberation_cards WHERE community_uri = $1',
      [communityUri],
    )
    return row?.count ?? 0
  }


  async getCardsPendingLLMEnrichment(limit = 10): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM deliberation_cards WHERE llm_enriched_at IS NULL ORDER BY extracted_at DESC LIMIT $1',
      [limit],
    )
  }


  async markCardEnriched(id: string, model: string): Promise<void> {
    await this.run(
      'UPDATE deliberation_cards SET llm_enriched_at = NOW(), llm_model = $1 WHERE id = $2',
      [model, id],
    )
  }


  async updateCardVisibility(
    id: string,
    isPublic: number,
    passportVisible: number,
  ): Promise<void> {
    await this.run(
      'UPDATE deliberation_cards SET is_public = $1, passport_visible = $2 WHERE id = $3',
      [isPublic, passportVisible, id],
    )
  }


  // ── Card Votes (Influence) ──

  async upsertCardVote(
    cardId: string,
    voterDid: string,
    influence: number,
  ): Promise<void> {
    await this.run(
      `INSERT INTO card_votes (card_id, voter_did, influence, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (card_id, voter_did) DO UPDATE SET
         influence = EXCLUDED.influence,
         updated_at = NOW()`,
      [cardId, voterDid, influence],
    )
  }


  async getCardVote(
    cardId: string,
    voterDid: string,
  ): Promise<{ influence: number } | undefined> {
    return this.queryOne<{ influence: number }>(
      'SELECT influence FROM card_votes WHERE card_id = $1 AND voter_did = $2',
      [cardId, voterDid],
    )
  }


  async getCardVotes(
    cardId: string,
  ): Promise<Array<{ voter_did: string; influence: number }>> {
    return this.queryAll<{ voter_did: string; influence: number }>(
      'SELECT voter_did, influence FROM card_votes WHERE card_id = $1',
      [cardId],
    )
  }


  async getCardInfluenceScores(
    cardIds: string[],
  ): Promise<Map<string, number>> {
    if (cardIds.length === 0) return new Map()
    const rows = await this.queryAll<{ card_id: string; total: number }>(
      'SELECT card_id, SUM(influence) as total FROM card_votes WHERE card_id = ANY($1) GROUP BY card_id',
      [cardIds],
    )
    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(row.card_id, row.total)
    }
    return map
  }


  async getCardVoteStats(
    cardIds: string[],
  ): Promise<Map<string, { total: number; count: number }>> {
    if (cardIds.length === 0) return new Map()
    const rows = await this.queryAll<{
      card_id: string
      total: number
      count: number
    }>(
      'SELECT card_id, SUM(influence) as total, COUNT(*) as count FROM card_votes WHERE card_id = ANY($1) GROUP BY card_id',
      [cardIds],
    )
    const map = new Map<string, { total: number; count: number }>()
    for (const row of rows) {
      map.set(row.card_id, { total: row.total, count: row.count })
    }
    return map
  }


  // ── Relationships ──

  async insertRelationship(rel: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    authorDid: string
  }): Promise<void> {
    await this.run(
      'INSERT INTO deliberation_relationships (id, source_card_id, target_card_id, relationship_type, author_did) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
      [
        rel.id,
        rel.sourceCardId,
        rel.targetCardId,
        rel.relationshipType,
        rel.authorDid,
      ],
    )
  }


  async getRelationshipsForCard(cardId: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM deliberation_relationships WHERE source_card_id = $1 OR target_card_id = $1',
      [cardId],
    )
  }


  async getGraphForCommunity(
    communityUri: string,
  ): Promise<{ nodes: any[]; edges: any[] }> {
    const nodes = await this.queryAll<any>(
      'SELECT * FROM deliberation_cards WHERE community_uri = $1',
      [communityUri],
    )
    const cardIds = nodes.map((n: any) => n.id)
    if (cardIds.length === 0) return { nodes: [], edges: [] }
    const edges = await this.queryAll<any>(
      'SELECT * FROM deliberation_relationships WHERE source_card_id = ANY($1) OR target_card_id = ANY($1)',
      [cardIds],
    )
    const voteStats = await this.getCardVoteStats(cardIds)
    for (const node of nodes) {
      const stats = voteStats.get(node.id)
      node.influence = stats?.total ?? 0
      node.vote_count = stats?.count ?? 0
      node.stance =
        node.influence > 0 ? 'pro' : node.influence < 0 ? 'con' : 'neutral'
    }
    return { nodes, edges }
  }


  async deleteRelationship(id: string): Promise<void> {
    await this.run('DELETE FROM deliberation_relationships WHERE id = $1', [id])
  }


  // ── Suggested Relationships ──

  async insertSuggestedRelationship(sugg: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    confidence: number
    reason: string
  }): Promise<void> {
    await this.run(
      'INSERT INTO suggested_relationships (id, source_card_id, target_card_id, relationship_type, confidence, reason) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING',
      [
        sugg.id,
        sugg.sourceCardId,
        sugg.targetCardId,
        sugg.relationshipType,
        sugg.confidence,
        sugg.reason,
      ],
    )
  }


  async getSuggestionsForCommunity(
    communityUri: string,
    opts: { status?: string; limit?: number } = {},
  ): Promise<any[]> {
    let sql = `SELECT sr.*, sc.title as source_title, sc.card_type as source_type, tc.title as target_title, tc.card_type as target_type
      FROM suggested_relationships sr
      JOIN deliberation_cards sc ON sr.source_card_id = sc.id
      JOIN deliberation_cards tc ON sr.target_card_id = tc.id
      WHERE sc.community_uri = $1`
    const params: (string | number)[] = [communityUri]
    let idx = 2
    if (opts.status) {
      sql += ` AND sr.status = $${idx++}`
      params.push(opts.status)
    }
    sql += ' ORDER BY sr.confidence DESC'
    if (opts.limit) {
      sql += ` LIMIT $${idx++}`
      params.push(opts.limit)
    }
    return this.queryAll(sql, params)
  }


  async acceptSuggestion(id: string, authorDid: string): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const suggResult = await client.query<{
        source_card_id: string
        target_card_id: string
        relationship_type: string
      }>('SELECT * FROM suggested_relationships WHERE id = $1', [id])
      const sugg = suggResult.rows[0]
      if (!sugg) {
        await client.query('ROLLBACK')
        client.release()
        return
      }
      await client.query(
        'UPDATE suggested_relationships SET status = $1 WHERE id = $2',
        ['accepted', id],
      )
      await client.query(
        'INSERT INTO deliberation_relationships (id, source_card_id, target_card_id, relationship_type, author_did) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
        [
          randomUUID(),
          sugg.source_card_id,
          sugg.target_card_id,
          sugg.relationship_type,
          authorDid,
        ],
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }


  async rejectSuggestion(id: string): Promise<void> {
    await this.run(
      'UPDATE suggested_relationships SET status = $1 WHERE id = $2',
      ['rejected', id],
    )
  }


  // ── Extracted Entities ──

  async insertEntity(entity: {
    cardId: string
    entityType: string
    entityValue: string
    startPos?: number
    endPos?: number
  }): Promise<void> {
    await this.run(
      'INSERT INTO extracted_entities (card_id, entity_type, entity_value, start_pos, end_pos) VALUES ($1, $2, $3, $4, $5)',
      [
        entity.cardId,
        entity.entityType,
        entity.entityValue,
        entity.startPos ?? null,
        entity.endPos ?? null,
      ],
    )
  }


  async getEntitiesForCard(cardId: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM extracted_entities WHERE card_id = $1',
      [cardId],
    )
  }


  // ── Community Pulse (Discourse Analysis) ──

  async getCommunityPulse(
    communityUri: string,
    voterDid?: string,
  ): Promise<{
    stanceDistribution: { pro: number; con: number; neutral: number }
    topEntities: Array<{ value: string; type: string; count: number }>
    trendingClaims: Array<{
      id: string
      title: string
      stance: string
      influence: number
      voteCount: number
      cardType: string
    }>
    controversialClaims: Array<{
      id: string
      title: string
      influence: number
      voteCount: number
      cardType: string
    }>
    userStats?: {
      votesCast: number
      proVotes: number
      conVotes: number
      neutralVotes: number
    }
  }> {
    const cards = await this.queryAll<{
      id: string
      title: string
      card_type: string
      influence: number
      vote_count: number
    }>(
      `
      SELECT c.id, c.title, c.card_type,
        COALESCE(SUM(v.influence), 0) as influence,
        COUNT(v.id) as vote_count
      FROM deliberation_cards c
      LEFT JOIN card_votes v ON c.id = v.card_id
      WHERE c.community_uri = $1
      GROUP BY c.id
    `,
      [communityUri],
    )

    let pro = 0,
      con = 0,
      neutral = 0
    for (const card of cards) {
      if (card.influence > 0) pro++
      else if (card.influence < 0) con++
      else neutral++
    }

    const entities = await this.queryAll<{
      value: string
      type: string
      count: number
    }>(
      `
      SELECT ee.entity_value as value, ee.entity_type as type, COUNT(*) as count
      FROM extracted_entities ee
      JOIN deliberation_cards c ON ee.card_id = c.id
      WHERE c.community_uri = $1
      GROUP BY ee.entity_value, ee.entity_type
      ORDER BY count DESC
      LIMIT 12
    `,
      [communityUri],
    )

    const trending = cards
      .filter((c) => Math.abs(c.influence) > 0)
      .sort((a, b) => Math.abs(b.influence) - Math.abs(a.influence))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title,
        stance: c.influence > 0 ? 'pro' : 'con',
        influence: c.influence,
        voteCount: c.vote_count,
        cardType: c.card_type,
      }))

    const controversial = cards
      .filter((c) => c.vote_count >= 2)
      .sort((a, b) => {
        const aControversy = a.vote_count / (Math.abs(a.influence) + 1)
        const bControversy = b.vote_count / (Math.abs(b.influence) + 1)
        return bControversy - aControversy
      })
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title,
        influence: c.influence,
        voteCount: c.vote_count,
        cardType: c.card_type,
      }))

    let userStats:
      | {
          votesCast: number
          proVotes: number
          conVotes: number
          neutralVotes: number
        }
      | undefined
    if (voterDid) {
      const userVotes = await this.queryAll<{
        id: string
        influence: number
        title: string
      }>(
        `
        SELECT c.id, v.influence, c.title
        FROM card_votes v
        JOIN deliberation_cards c ON v.card_id = c.id
        WHERE c.community_uri = $1 AND v.voter_did = $2
      `,
        [communityUri, voterDid],
      )

      let proVotes = 0,
        conVotes = 0,
        neutralVotes = 0
      for (const v of userVotes) {
        if (v.influence > 0) proVotes++
        else if (v.influence < 0) conVotes++
        else neutralVotes++
      }

      userStats = {
        votesCast: userVotes.length,
        proVotes,
        conVotes,
        neutralVotes,
      }
    }

    return {
      stanceDistribution: { pro, con, neutral },
      topEntities: entities,
      trendingClaims: trending,
      controversialClaims: controversial,
      userStats,
    }
  }
}
