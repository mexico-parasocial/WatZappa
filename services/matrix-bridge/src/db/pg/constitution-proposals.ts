import { randomUUID } from 'node:crypto'
import type {
  AiConsentRecord, CommunitySpaceMap, CommunityRoomKind, CommunityRoomSummary,
  SyncLogEntry, UserMatrixMap, UserPushToken,
} from '../interface.js'
import { InfraArea } from './infra.js'

export class ConstitutionProposalsArea extends InfraArea {


  // Constitutions
  async setConstitution(
    communityUri: string,
    version: number,
    rulesJson: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO community_constitution (community_uri, version, rules_json, created_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (community_uri) DO UPDATE SET version = EXCLUDED.version, rules_json = EXCLUDED.rules_json, created_at = EXCLUDED.created_at`,
      [communityUri, version, rulesJson],
    )
  }


  async getConstitution(communityUri: string): Promise<
    | {
        communityUri: string
        version: number
        rulesJson: string
        createdAt: string
      }
    | undefined
  > {
    const row = await this.queryOne<{
      community_uri: string
      version: number
      rules_json: string
      created_at: string
    }>('SELECT * FROM community_constitution WHERE community_uri = $1', [
      communityUri,
    ])
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
  async insertProposal(
    uri: string,
    communityUri: string,
    authorDid: string,
    title: string,
    body: string,
    proposalType: string,
    budgetRequest: number | null,
    createdAt: string,
  ): Promise<void> {
    await this.run(
      'INSERT INTO proposals (uri, community_uri, author_did, title, body, proposal_type, budget_request, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        uri,
        communityUri,
        authorDid,
        title,
        body,
        proposalType,
        budgetRequest,
        createdAt,
      ],
    )
  }


  async getProposal(uri: string): Promise<any | undefined> {
    return this.queryOne('SELECT * FROM proposals WHERE uri = $1', [uri])
  }


  async getProposalsByCommunity(
    communityUri: string,
    state?: string,
  ): Promise<any[]> {
    if (state) {
      return this.queryAll(
        'SELECT * FROM proposals WHERE community_uri = $1 AND state = $2 ORDER BY created_at ASC',
        [communityUri, state],
      )
    }
    return this.queryAll(
      'SELECT * FROM proposals WHERE community_uri = $1 ORDER BY created_at ASC',
      [communityUri],
    )
  }


  async getProposalsByState(state: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM proposals WHERE state = $1 ORDER BY created_at ASC',
      [state],
    )
  }


  async updateProposalState(
    uri: string,
    state: string,
    votingStartsAt?: string,
    votingEndsAt?: string,
  ): Promise<void> {
    await this.run(
      'UPDATE proposals SET state = $1, voting_starts_at = $2, voting_ends_at = $3 WHERE uri = $4',
      [state, votingStartsAt ?? null, votingEndsAt ?? null, uri],
    )
  }


  async updateProposalVoteCounts(
    uri: string,
    forVotes: number,
    againstVotes: number,
    abstainVotes: number,
  ): Promise<void> {
    await this.run(
      'UPDATE proposals SET votes_for = $1, votes_against = $2, votes_abstain = $3 WHERE uri = $4',
      [forVotes, againstVotes, abstainVotes, uri],
    )
  }


  async finalizeProposal(
    uri: string,
    result: string,
    decidedAt: string,
  ): Promise<void> {
    await this.run(
      'UPDATE proposals SET state = $1, decided_at = $2 WHERE uri = $3',
      [result, decidedAt, uri],
    )
  }


  // Votes
  async insertVote(
    uri: string,
    proposalUri: string,
    communityUri: string,
    voterDid: string,
    choice: string,
    weight: number,
    createdAt: string,
  ): Promise<void> {
    await this.run(
      `INSERT INTO votes (uri, proposal_uri, community_uri, voter_did, choice, weight, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (uri) DO UPDATE SET proposal_uri = EXCLUDED.proposal_uri, community_uri = EXCLUDED.community_uri, voter_did = EXCLUDED.voter_did, choice = EXCLUDED.choice, weight = EXCLUDED.weight, created_at = EXCLUDED.created_at`,
      [uri, proposalUri, communityUri, voterDid, choice, weight, createdAt],
    )
  }


  async getVotesForProposal(proposalUri: string): Promise<any[]> {
    return this.queryAll('SELECT * FROM votes WHERE proposal_uri = $1', [
      proposalUri,
    ])
  }


  // Decisions
  async insertDecision(
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
  ): Promise<void> {
    await this.run(
      'INSERT INTO decisions (proposal_uri, community_uri, result, votes_for, votes_against, votes_abstain, total_members, quorum_required, threshold_required, constitution_version, budget_allocated, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
      [
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
      ],
    )
  }


  async getDecision(proposalUri: string): Promise<any | undefined> {
    return this.queryOne('SELECT * FROM decisions WHERE proposal_uri = $1', [
      proposalUri,
    ])
  }


  async getDecisionsByCommunity(communityUri: string): Promise<any[]> {
    return this.queryAll(
      'SELECT * FROM decisions WHERE community_uri = $1 ORDER BY created_at DESC',
      [communityUri],
    )
  }
}
