/**
 * Proposal Lifecycle Engine — Constitution as Code in action
 *
 * Every proposal goes through a state machine:
 *   deliberating → voting → [approved | rejected | tied | quorum_not_met]
 *
 * Rules are read from the community's constitution record.
 * This is where abstract governance becomes executable policy.
 */

import type { Logger } from 'pino'
import type { ChatModerationEngine } from './chat-moderation.js'
import { getEffectiveRules, isApproved } from './constitution.js'
import type { BridgeDatabase } from './db.js'
import type { MatrixAdminClient } from './matrix.js'

export type ProposalState =
  | 'deliberating'
  | 'voting'
  | 'approved'
  | 'rejected'
  | 'tied'
  | 'quorum_not_met'

export class ProposalEngine {
  private db: BridgeDatabase
  private matrix: MatrixAdminClient
  private chatMod: ChatModerationEngine
  private log: Logger

  constructor(
    db: BridgeDatabase,
    matrix: MatrixAdminClient,
    log: Logger,
    chatMod: ChatModerationEngine,
  ) {
    this.db = db
    this.matrix = matrix
    this.chatMod = chatMod
    this.log = log
  }

  /**
   * Called when a new proposal is seen on the firehose.
   */
  onProposalCreated(
    uri: string,
    communityUri: string,
    authorDid: string,
    title: string,
    body: string,
    proposalType: string,
    budgetRequest: number | null,
    createdAt: string,
  ): void {
    const existing = this.db.getProposal(uri)
    if (existing) {
      this.log.debug({ uri }, 'Proposal already tracked')
      return
    }

    this.db.insertProposal(
      uri,
      communityUri,
      authorDid,
      title,
      body,
      proposalType,
      budgetRequest,
      createdAt,
    )

    this.chatMod.recordProposal(authorDid, communityUri)

    this.log.info(
      { uri, communityUri, authorDid, type: proposalType },
      'New proposal tracked',
    )
  }

  /**
   * Called when a vote is seen on the firehose.
   */
  onVoteCast(
    uri: string,
    proposalUri: string,
    communityUri: string,
    voterDid: string,
    choice: string,
    createdAt: string,
  ): void {
    const proposal = this.db.getProposal(proposalUri)
    if (!proposal) {
      this.log.debug({ proposalUri }, 'Vote for unknown proposal, skipping')
      return
    }

    if (proposal.state !== 'voting') {
      this.log.debug(
        { proposalUri, state: proposal.state },
        'Vote outside voting window, ignoring',
      )
      return
    }

    const constitution = this.db.getConstitution(communityUri)
    const parsedConstitution = constitution
      ? {
          community: constitution.communityUri,
          version: constitution.version,
          rules: JSON.parse(
            constitution.rulesJson,
          ) as import('./constitution.js').GovernanceRules,
          createdAt: constitution.createdAt,
        }
      : undefined
    const rules = getEffectiveRules(parsedConstitution)

    // Weight: 1.0 default. Future: quadratic weighting.
    let weight = 1.0
    if (rules.budget?.enabled && proposal.proposal_type === 'budget') {
      weight = 1.0
    }

    this.db.insertVote(
      uri,
      proposalUri,
      communityUri,
      voterDid,
      choice,
      weight,
      createdAt,
    )

    this.chatMod.recordVote(voterDid, communityUri)

    // Recalculate running totals
    const votes = this.db.getVotesForProposal(proposalUri)
    const forVotes = votes
      .filter((v: any) => v.choice === 'for')
      .reduce((sum: number, v: any) => sum + v.weight, 0)
    const againstVotes = votes
      .filter((v: any) => v.choice === 'against')
      .reduce((sum: number, v: any) => sum + v.weight, 0)
    const abstainVotes = votes
      .filter((v: any) => v.choice === 'abstain')
      .reduce((sum: number, v: any) => sum + v.weight, 0)

    this.db.updateProposalVoteCounts(
      proposalUri,
      Math.round(forVotes),
      Math.round(againstVotes),
      Math.round(abstainVotes),
    )

    this.log.info({ proposalUri, voterDid, choice, weight }, 'Vote recorded')
  }

  /**
   * Run state transitions. Called periodically by a cron worker.
   * This is where the constitution is actually enforced.
   */
  async processStateTransitions(): Promise<void> {
    const now = new Date().toISOString()

    // 1. deliberating → voting (FIFO queue: one proposal per community at a time)
    const deliberating = this.db.getProposalsByState('deliberating')
    const communitiesWithActiveVoting = new Set<string>()

    // Pre-compute which communities already have a voting proposal
    const activeVoting = this.db.getProposalsByState('voting')
    for (const v of activeVoting) {
      communitiesWithActiveVoting.add(v.community_uri)
    }

    for (const p of deliberating) {
      // Skip if this community already has a proposal being voted on
      if (communitiesWithActiveVoting.has(p.community_uri)) {
        this.log.debug(
          { uri: p.uri, community: p.community_uri },
          'FIFO queue: another proposal is already voting in this community',
        )
        continue
      }

      const constitution = this.db.getConstitution(p.community_uri)
      const parsedConstitution = constitution
        ? {
            community: constitution.communityUri,
            version: constitution.version,
            rules: JSON.parse(
              constitution.rulesJson,
            ) as import('./constitution.js').GovernanceRules,
            createdAt: constitution.createdAt,
          }
        : undefined
      const rules = getEffectiveRules(parsedConstitution)
      const deliberationMs = (rules.deliberationDays ?? 7) * 24 * 60 * 60 * 1000
      const created = new Date(p.created_at).getTime()
      const canVote = Date.now() - created >= deliberationMs

      if (canVote) {
        const votingDays = rules.votingDays ?? 3
        const votingEnds = new Date(
          Date.now() + votingDays * 24 * 60 * 60 * 1000,
        ).toISOString()
        this.db.updateProposalState(p.uri, 'voting', now, votingEnds)
        communitiesWithActiveVoting.add(p.community_uri)
        this.log.info({ uri: p.uri }, 'Proposal moved to voting (FIFO)')

        try {
          await this.announceInMatrix(
            p.community_uri,
            `🗳️ Votación abierta: ${p.title}\nTienen ${votingDays} días para votar.`,
          )
        } catch (err) {
          this.log.error({ err, uri: p.uri }, 'Failed to announce voting start')
        }
      }
    }

    // 2. voting → decided
    const voting = this.db.getProposalsByState('voting')
    for (const p of voting) {
      if (!p.voting_ends_at || now < p.voting_ends_at) continue

      const constitution = this.db.getConstitution(p.community_uri)
      const parsedConstitution = constitution
        ? {
            community: constitution.communityUri,
            version: constitution.version,
            rules: JSON.parse(
              constitution.rulesJson,
            ) as import('./constitution.js').GovernanceRules,
            createdAt: constitution.createdAt,
          }
        : undefined
      const rules = getEffectiveRules(parsedConstitution)

      const totalMembers = await this.getEligibleVoterCount(p.community_uri)
      const quorumThreshold = rules.quorum ?? 0.51
      const quorumNeeded = Math.ceil(totalMembers * quorumThreshold)
      const totalVotes = p.votes_for + p.votes_against + p.votes_abstain

      let result: ProposalState

      if (totalVotes < quorumNeeded) {
        result = 'quorum_not_met'
      } else if (p.votes_for === p.votes_against) {
        result = 'tied'
      } else if (isApproved(parsedConstitution, p.votes_for, p.votes_against)) {
        result = 'approved'
      } else {
        result = 'rejected'
      }

      this.db.finalizeProposal(p.uri, result, now)

      const budgetAllocated =
        result === 'approved' &&
        p.proposal_type === 'budget' &&
        p.budget_request
          ? p.budget_request
          : null

      this.db.insertDecision(
        p.uri,
        p.community_uri,
        result,
        p.votes_for,
        p.votes_against,
        p.votes_abstain,
        totalMembers,
        quorumThreshold,
        rules.approvalThreshold ?? 0.5,
        constitution?.version ?? 1,
        budgetAllocated,
        now,
      )

      this.log.info(
        {
          uri: p.uri,
          result,
          for: p.votes_for,
          against: p.votes_against,
          totalMembers,
          quorumNeeded,
        },
        'Proposal decided',
      )

      // Post result to Matrix
      try {
        const emoji =
          result === 'approved' ? '✅' : result === 'rejected' ? '❌' : '⚖️'
        await this.announceInMatrix(
          p.community_uri,
          `${emoji} Resultado: ${p.title}\nA favor: ${p.votes_for} | En contra: ${p.votes_against} | Abstenciones: ${p.votes_abstain}\nEstado: ${result}`,
        )
      } catch (err) {
        this.log.error({ err, uri: p.uri }, 'Failed to announce result')
      }
    }
  }

  private async getEligibleVoterCount(communityUri: string): Promise<number> {
    // Count active members in chamber_assignment for bicameral, or estimate for unicameral
    const space = this.db.getSpaceForCommunity(communityUri)
    if (!space) return 0

    // Simple heuristic: count chamber assignments + a buffer
    const countA = this.db.getChamberMemberCount(communityUri, 'A')
    const countB = this.db.getChamberMemberCount(communityUri, 'B')
    return countA + countB
  }

  private async announceInMatrix(
    communityUri: string,
    message: string,
  ): Promise<void> {
    const space = this.db.getSpaceForCommunity(communityUri)
    if (!space?.spaceId) return

    // Use the main space as announcement channel
    // In a real implementation, we'd have a dedicated "announcements" room
    // For now, we don't have a bot client to post messages — this is a placeholder
    this.log.info(
      { communityUri, message: message.slice(0, 100) },
      'Matrix announcement (placeholder)',
    )
  }
}
