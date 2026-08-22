import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { InfraArea } from './infra.js'

export class ConstitutionProposalsArea extends InfraArea {


  // Constitutions
  setConstitution(
    communityUri: string,
    version: number,
    rulesJson: string,
  ): void {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO community_constitution (community_uri, version, rules_json, created_at) VALUES (?, ?, ?, datetime('now'))",
      )
      .run(communityUri, version, rulesJson)
  }


  getConstitution(communityUri: string):
    | {
        communityUri: string
        version: number
        rulesJson: string
        createdAt: string
      }
    | undefined {
    const row = this.db
      .prepare('SELECT * FROM community_constitution WHERE community_uri = ?')
      .get(communityUri) as
      | {
          community_uri: string
          version: number
          rules_json: string
          created_at: string
        }
      | undefined
    return row
      ? {
          communityUri: row.community_uri,
          version: row.version,
          rulesJson: row.rules_json,
          createdAt: row.created_at,
        }
      : undefined
  }


  // Proposals
  insertProposal(
    uri: string,
    communityUri: string,
    authorDid: string,
    title: string,
    body: string,
    proposalType: string,
    budgetRequest: number | null,
    createdAt: string,
  ): void {
    this.db
      .prepare(
        'INSERT INTO proposals (uri, community_uri, author_did, title, body, proposal_type, budget_request, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        uri,
        communityUri,
        authorDid,
        title,
        body,
        proposalType,
        budgetRequest,
        createdAt,
      )
  }


  getProposal(uri: string): any | undefined {
    return this.db.prepare('SELECT * FROM proposals WHERE uri = ?').get(uri)
  }


  getProposalsByCommunity(communityUri: string, state?: string): any[] {
    if (state) {
      return this.db
        .prepare(
          'SELECT * FROM proposals WHERE community_uri = ? AND state = ? ORDER BY created_at ASC',
        )
        .all(communityUri, state) as any[]
    }
    return this.db
      .prepare(
        'SELECT * FROM proposals WHERE community_uri = ? ORDER BY created_at ASC',
      )
      .all(communityUri) as any[]
  }


  getProposalsByState(state: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM proposals WHERE state = ? ORDER BY created_at ASC',
      )
      .all(state) as any[]
  }


  updateProposalState(
    uri: string,
    state: string,
    votingStartsAt?: string,
    votingEndsAt?: string,
  ): void {
    this.db
      .prepare(
        'UPDATE proposals SET state = ?, voting_starts_at = ?, voting_ends_at = ? WHERE uri = ?',
      )
      .run(state, votingStartsAt ?? null, votingEndsAt ?? null, uri)
  }


  updateProposalVoteCounts(
    uri: string,
    forVotes: number,
    againstVotes: number,
    abstainVotes: number,
  ): void {
    this.db
      .prepare(
        'UPDATE proposals SET votes_for = ?, votes_against = ?, votes_abstain = ? WHERE uri = ?',
      )
      .run(forVotes, againstVotes, abstainVotes, uri)
  }


  finalizeProposal(uri: string, result: string, decidedAt: string): void {
    this.db
      .prepare('UPDATE proposals SET state = ?, decided_at = ? WHERE uri = ?')
      .run(result, decidedAt, uri)
  }


  // Votes
  insertVote(
    uri: string,
    proposalUri: string,
    communityUri: string,
    voterDid: string,
    choice: string,
    weight: number,
    createdAt: string,
  ): void {
    this.db
      .prepare(
        'INSERT OR REPLACE INTO votes (uri, proposal_uri, community_uri, voter_did, choice, weight, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(uri, proposalUri, communityUri, voterDid, choice, weight, createdAt)
  }


  getVotesForProposal(proposalUri: string): any[] {
    return this.db
      .prepare('SELECT * FROM votes WHERE proposal_uri = ?')
      .all(proposalUri) as any[]
  }


  // Decisions
  insertDecision(
    proposalUri: string,
    communityUri: string,
    result: string,
    votesFor: number,
    votesAgainst: number,
    votesAbstain: number,
    totalMembers: number | null,
    quorumRequired: number,
    thresholdRequired: number,
    constitutionVersion: number,
    budgetAllocated: number | null,
    createdAt: string,
  ): void {
    this.db
      .prepare(
        'INSERT INTO decisions (proposal_uri, community_uri, result, votes_for, votes_against, votes_abstain, total_members, quorum_required, threshold_required, constitution_version, budget_allocated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        proposalUri,
        communityUri,
        result,
        votesFor,
        votesAgainst,
        votesAbstain,
        totalMembers,
        quorumRequired,
        thresholdRequired,
        constitutionVersion,
        budgetAllocated,
        createdAt,
      )
  }


  getDecision(proposalUri: string): any | undefined {
    return this.db
      .prepare('SELECT * FROM decisions WHERE proposal_uri = ?')
      .get(proposalUri)
  }


  getDecisionsByCommunity(communityUri: string): any[] {
    return this.db
      .prepare(
        'SELECT * FROM decisions WHERE community_uri = ? ORDER BY created_at DESC',
      )
      .all(communityUri) as any[]
  }
}
