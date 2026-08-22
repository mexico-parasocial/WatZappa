import { randomUUID } from 'node:crypto'
import { decideContribution } from '../../contributions.js'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { MatrixEventsArea } from './matrix-events.js'

export class DeliberationArea extends MatrixEventsArea {


  // ── Deliberation Cards ──

  insertCard(card: {
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
  }): void {
    this.db
      .prepare(
        "INSERT INTO deliberation_cards (id, community_uri, author_did, title, content, card_type, source_room_id, source_event_id, source_url, is_public, passport_visible, metadata, extracted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
      )
      .run(
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
      )
  }


  getCardsForCommunity(
    communityUri: string,
    opts: {
      limit?: number
      offset?: number
      cardType?: string
      authorDid?: string
    } = {},
  ): any[] {
    let sql = 'SELECT * FROM deliberation_cards WHERE community_uri = ?'
    const params: (string | number)[] = [communityUri]
    if (opts.cardType) {
      sql += ' AND card_type = ?'
      params.push(opts.cardType)
    }
    if (opts.authorDid) {
      sql += ' AND author_did = ?'
      params.push(opts.authorDid)
    }
    sql += ' ORDER BY extracted_at DESC'
    if (opts.limit) {
      sql += ' LIMIT ?'
      params.push(opts.limit)
    }
    if (opts.offset) {
      sql += ' OFFSET ?'
      params.push(opts.offset)
    }
    return this.db.prepare(sql).all(...params) as any[]
  }


  getCard(id: string): any | undefined {
    return this.db
      .prepare('SELECT * FROM deliberation_cards WHERE id = ?')
      .get(id)
  }


  getCardCount(communityUri: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM deliberation_cards WHERE community_uri = ?',
      )
      .get(communityUri) as { count: number }
    return row.count
  }


  // ── Community Map Contributions ──

  protected mapCommunityContribution(row: any, viewerDid?: string): any {
    const counts = this.getCommunityContributionVoteCounts(row.id)
    const viewerVote = viewerDid
      ? this.getCommunityContributionVote(row.id, viewerDid)
      : undefined
    return {
      id: row.id,
      community_uri: row.community_uri,
      author_did: row.author_did,
      title: row.title,
      content: row.content,
      source_url: row.source_url,
      source_type: row.source_type,
      metadata: row.metadata,
      status: row.status,
      approved_card_id: row.approved_card_id,
      created_at: row.created_at,
      decided_at: row.decided_at,
      approve_count: counts.approve,
      reject_count: counts.reject,
      viewer_vote: viewerVote?.vote,
    }
  }


  insertCommunityMapContribution(contribution: {
    id: string
    communityUri: string
    authorDid: string
    title: string
    content?: string
    sourceUrl?: string
    sourceType: string
    metadata?: string
  }): void {
    this.db
      .prepare(
        'INSERT INTO community_map_contributions (id, community_uri, author_did, title, content, source_url, source_type, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        contribution.id,
        contribution.communityUri,
        contribution.authorDid,
        contribution.title,
        contribution.content ?? null,
        contribution.sourceUrl ?? null,
        contribution.sourceType,
        contribution.metadata ?? null,
      )
  }


  getCommunityMapContributions(
    communityUri: string,
    opts: { status?: string; viewerDid?: string; limit?: number } = {},
  ): any[] {
    let sql =
      'SELECT * FROM community_map_contributions WHERE community_uri = ?'
    const params: (string | number)[] = [communityUri]
    if (opts.status) {
      sql += ' AND status = ?'
      params.push(opts.status)
    }
    sql += ' ORDER BY created_at DESC'
    if (opts.limit) {
      sql += ' LIMIT ?'
      params.push(opts.limit)
    }
    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map((row) => this.mapCommunityContribution(row, opts.viewerDid))
  }


  getCommunityMapContribution(id: string, viewerDid?: string): any | undefined {
    const row = this.db
      .prepare('SELECT * FROM community_map_contributions WHERE id = ?')
      .get(id)
    return row ? this.mapCommunityContribution(row, viewerDid) : undefined
  }


  getCommunityContributionVote(
    contributionId: string,
    voterDid: string,
  ): { vote: string } | undefined {
    return this.db
      .prepare(
        'SELECT vote FROM community_map_contribution_votes WHERE contribution_id = ? AND voter_did = ?',
      )
      .get(contributionId, voterDid) as { vote: string } | undefined
  }


  getCommunityContributionVoteCounts(contributionId: string): {
    approve: number
    reject: number
  } {
    const rows = this.db
      .prepare(
        'SELECT vote, COUNT(*) as count FROM community_map_contribution_votes WHERE contribution_id = ? GROUP BY vote',
      )
      .all(contributionId) as Array<{ vote: string; count: number }>
    return {
      approve: rows.find((row) => row.vote === 'approve')?.count ?? 0,
      reject: rows.find((row) => row.vote === 'reject')?.count ?? 0,
    }
  }


  voteCommunityMapContribution(
    contributionId: string,
    voterDid: string,
    vote: 'approve' | 'reject',
  ): any {
    const decide = this.db.transaction(() => {
      const existing = this.db
        .prepare('SELECT * FROM community_map_contributions WHERE id = ?')
        .get(contributionId) as any | undefined
      if (!existing) {
        throw new Error('Contribution not found')
      }
      if (existing.status !== 'pending') {
        return this.mapCommunityContribution(existing, voterDid)
      }

      this.db
        .prepare(
          "INSERT OR REPLACE INTO community_map_contribution_votes (contribution_id, voter_did, vote, created_at) VALUES (?, ?, ?, datetime('now'))",
        )
        .run(contributionId, voterDid, vote)

      const counts = this.getCommunityContributionVoteCounts(contributionId)
      const decision = decideContribution(counts)

      if (decision === 'approve') {
        const cardId = randomUUID()
        this.insertCard({
          id: cardId,
          communityUri: existing.community_uri,
          authorDid: existing.author_did,
          title: existing.title,
          content: existing.content ?? undefined,
          cardType: existing.source_type,
          sourceUrl: existing.source_url ?? undefined,
          isPublic: 1,
          passportVisible: 1,
          metadata: existing.metadata ?? undefined,
        })
        this.db
          .prepare(
            "UPDATE community_map_contributions SET status = ?, approved_card_id = ?, decided_at = datetime('now') WHERE id = ?",
          )
          .run('approved', cardId, contributionId)
      } else if (decision === 'reject') {
        this.db
          .prepare(
            "UPDATE community_map_contributions SET status = ?, decided_at = datetime('now') WHERE id = ?",
          )
          .run('rejected', contributionId)
      }

      const updated = this.db
        .prepare('SELECT * FROM community_map_contributions WHERE id = ?')
        .get(contributionId) as any
      return this.mapCommunityContribution(updated, voterDid)
    })

    return decide()
  }


  getCardsPendingLLMEnrichment(limit = 10): any[] {
    return this.db
      .prepare(
        'SELECT * FROM deliberation_cards WHERE llm_enriched_at IS NULL ORDER BY extracted_at DESC LIMIT ?',
      )
      .all(limit) as any[]
  }


  markCardEnriched(id: string, model: string): void {
    this.db
      .prepare(
        "UPDATE deliberation_cards SET llm_enriched_at = datetime('now'), llm_model = ? WHERE id = ?",
      )
      .run(model, id)
  }


  updateCardVisibility(
    id: string,
    isPublic: number,
    passportVisible: number,
  ): void {
    this.db
      .prepare(
        'UPDATE deliberation_cards SET is_public = ?, passport_visible = ? WHERE id = ?',
      )
      .run(isPublic, passportVisible, id)
  }


  // ── Card Votes (Influence) ──

  upsertCardVote(cardId: string, voterDid: string, influence: number): void {
    this.db
      .prepare(
        `
        INSERT INTO card_votes (card_id, voter_did, influence, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(card_id, voter_did) DO UPDATE SET
          influence = excluded.influence,
          updated_at = datetime('now')
      `,
      )
      .run(cardId, voterDid, influence)
  }


  getCardVote(
    cardId: string,
    voterDid: string,
  ): { influence: number } | undefined {
    return this.db
      .prepare(
        'SELECT influence FROM card_votes WHERE card_id = ? AND voter_did = ?',
      )
      .get(cardId, voterDid) as { influence: number } | undefined
  }


  getCardVotes(
    cardId: string,
  ): Array<{ voter_did: string; influence: number }> {
    return this.db
      .prepare('SELECT voter_did, influence FROM card_votes WHERE card_id = ?')
      .all(cardId) as Array<{ voter_did: string; influence: number }>
  }


  getCardInfluenceScores(cardIds: string[]): Map<string, number> {
    if (cardIds.length === 0) return new Map()
    const placeholders = cardIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT card_id, SUM(influence) as total FROM card_votes WHERE card_id IN (${placeholders}) GROUP BY card_id`,
      )
      .all(...cardIds) as Array<{ card_id: string; total: number }>
    const map = new Map<string, number>()
    for (const row of rows) {
      map.set(row.card_id, row.total)
    }
    return map
  }


  getCardVoteStats(
    cardIds: string[],
  ): Map<string, { total: number; count: number }> {
    if (cardIds.length === 0) return new Map()
    const placeholders = cardIds.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT card_id, SUM(influence) as total, COUNT(*) as count FROM card_votes WHERE card_id IN (${placeholders}) GROUP BY card_id`,
      )
      .all(...cardIds) as Array<{
      card_id: string
      total: number
      count: number
    }>
    const map = new Map<string, { total: number; count: number }>()
    for (const row of rows) {
      map.set(row.card_id, { total: row.total, count: row.count })
    }
    return map
  }


  // ── Relationships ──

  insertRelationship(rel: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    authorDid: string
  }): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO deliberation_relationships (id, source_card_id, target_card_id, relationship_type, author_did) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        rel.id,
        rel.sourceCardId,
        rel.targetCardId,
        rel.relationshipType,
        rel.authorDid,
      )
  }


  getRelationshipsForCard(cardId: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM deliberation_relationships WHERE source_card_id = ? OR target_card_id = ?',
      )
      .all(cardId, cardId) as any[]
  }


  getGraphForCommunity(communityUri: string): { nodes: any[]; edges: any[] } {
    const nodes = this.db
      .prepare('SELECT * FROM deliberation_cards WHERE community_uri = ?')
      .all(communityUri) as any[]
    const cardIds = nodes.map((n: any) => n.id)
    if (cardIds.length === 0) return { nodes: [], edges: [] }
    const placeholders = cardIds.map(() => '?').join(',')
    const edges = this.db
      .prepare(
        `SELECT * FROM deliberation_relationships WHERE source_card_id IN (${placeholders}) OR target_card_id IN (${placeholders})`,
      )
      .all(...cardIds, ...cardIds) as any[]
    const voteStats = this.getCardVoteStats(cardIds)
    for (const node of nodes) {
      const stats = voteStats.get(node.id)
      node.influence = stats?.total ?? 0
      node.vote_count = stats?.count ?? 0
      node.stance =
        node.influence > 0 ? 'pro' : node.influence < 0 ? 'con' : 'neutral'
    }
    return { nodes, edges }
  }


  deleteRelationship(id: string): void {
    this.db
      .prepare('DELETE FROM deliberation_relationships WHERE id = ?')
      .run(id)
  }


  // ── Suggested Relationships ──

  insertSuggestedRelationship(sugg: {
    id: string
    sourceCardId: string
    targetCardId: string
    relationshipType: string
    confidence: number
    reason: string
  }): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO suggested_relationships (id, source_card_id, target_card_id, relationship_type, confidence, reason) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        sugg.id,
        sugg.sourceCardId,
        sugg.targetCardId,
        sugg.relationshipType,
        sugg.confidence,
        sugg.reason,
      )
  }


  getSuggestionsForCommunity(
    communityUri: string,
    opts: { status?: string; limit?: number } = {},
  ): any[] {
    let sql = `SELECT sr.*, sc.title as source_title, sc.card_type as source_type, tc.title as target_title, tc.card_type as target_type
      FROM suggested_relationships sr
      JOIN deliberation_cards sc ON sr.source_card_id = sc.id
      JOIN deliberation_cards tc ON sr.target_card_id = tc.id
      WHERE sc.community_uri = ?`
    const params: (string | number)[] = [communityUri]
    if (opts.status) {
      sql += ' AND sr.status = ?'
      params.push(opts.status)
    }
    sql += ' ORDER BY sr.confidence DESC'
    if (opts.limit) {
      sql += ' LIMIT ?'
      params.push(opts.limit)
    }
    return this.db.prepare(sql).all(...params) as any[]
  }


  acceptSuggestion(id: string, authorDid: string): void {
    const sugg = this.db
      .prepare('SELECT * FROM suggested_relationships WHERE id = ?')
      .get(id) as
      | {
          source_card_id: string
          target_card_id: string
          relationship_type: string
        }
      | undefined
    if (!sugg) return
    this.db
      .prepare('UPDATE suggested_relationships SET status = ? WHERE id = ?')
      .run('accepted', id)
    this.insertRelationship({
      id: randomUUID(),
      sourceCardId: sugg.source_card_id,
      targetCardId: sugg.target_card_id,
      relationshipType: sugg.relationship_type,
      authorDid,
    })
  }


  rejectSuggestion(id: string): void {
    this.db
      .prepare('UPDATE suggested_relationships SET status = ? WHERE id = ?')
      .run('rejected', id)
  }


  // ── Extracted Entities ──

  insertEntity(entity: {
    cardId: string
    entityType: string
    entityValue: string
    startPos?: number
    endPos?: number
  }): void {
    this.db
      .prepare(
        'INSERT INTO extracted_entities (card_id, entity_type, entity_value, start_pos, end_pos) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        entity.cardId,
        entity.entityType,
        entity.entityValue,
        entity.startPos ?? null,
        entity.endPos ?? null,
      )
  }


  getEntitiesForCard(cardId: string): any[] {
    return this.db
      .prepare('SELECT * FROM extracted_entities WHERE card_id = ?')
      .all(cardId) as any[]
  }


  // ── Community Pulse (Discourse Analysis) ──

  getCommunityPulse(
    communityUri: string,
    voterDid?: string,
  ): {
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
      topAgreedTopic?: string
      topDisagreedTopic?: string
    }
  } {
    // Get all cards for community with their vote stats
    const cards = this.db
      .prepare(
        `
      SELECT c.id, c.title, c.card_type,
        COALESCE(SUM(v.influence), 0) as influence,
        COUNT(v.id) as vote_count
      FROM deliberation_cards c
      LEFT JOIN card_votes v ON c.id = v.card_id
      WHERE c.community_uri = ?
      GROUP BY c.id
    `,
      )
      .all(communityUri) as Array<{
      id: string
      title: string
      card_type: string
      influence: number
      vote_count: number
    }>

    // Stance distribution
    let pro = 0,
      con = 0,
      neutral = 0
    for (const card of cards) {
      if (card.influence > 0) pro++
      else if (card.influence < 0) con++
      else neutral++
    }

    // Top entities across community cards
    const entities = this.db
      .prepare(
        `
      SELECT ee.entity_value as value, ee.entity_type as type, COUNT(*) as count
      FROM extracted_entities ee
      JOIN deliberation_cards c ON ee.card_id = c.id
      WHERE c.community_uri = ?
      GROUP BY ee.entity_value, ee.entity_type
      ORDER BY count DESC
      LIMIT 12
    `,
      )
      .all(communityUri) as Array<{
      value: string
      type: string
      count: number
    }>

    // Trending claims: highest absolute influence
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

    // Controversial: high vote count but low |influence| (divided opinions)
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

    // User stats
    let userStats:
      | {
          votesCast: number
          proVotes: number
          conVotes: number
          neutralVotes: number
        }
      | undefined
    if (voterDid) {
      const userVotes = this.db
        .prepare(
          `
        SELECT c.id, v.influence, c.title
        FROM card_votes v
        JOIN deliberation_cards c ON v.card_id = c.id
        WHERE c.community_uri = ? AND v.voter_did = ?
      `,
        )
        .all(communityUri, voterDid) as Array<{
        id: string
        influence: number
        title: string
      }>

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
