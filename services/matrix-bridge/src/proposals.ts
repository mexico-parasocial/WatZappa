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
import type { IBridgeDatabase } from './db/index.js'
import type { MatrixAdminClient } from './matrix.js'

export type ProposalState =
  | 'deliberating'
  | 'voting'
  | 'approved'
  | 'rejected'
  | 'tied'
  | 'quorum_not_met'

export class ProposalEngine {
  private db: IBridgeDatabase
  private matrix: MatrixAdminClient
  private chatMod: ChatModerationEngine
  private log: Logger

  constructor(
    db: IBridgeDatabase,
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
  async onProposalCreated(
    uri: string,
    communityUri: string,
    authorDid: string,
    title: string,
    body: string,
    proposalType: string,
    budgetRequest: number | null,
    createdAt: string,
  ): Promise<void> {
    const existing = await this.db.getProposal(uri)
    if (existing) {
      this.log.debug({ uri }, 'Proposal already tracked')
      return
    }

    await this.db.insertProposal(
      uri,
      communityUri,
      authorDid,
      title,
      body,
      proposalType,
      budgetRequest,
      createdAt,
    )

    await this.chatMod.recordProposal(authorDid, communityUri)

    this.log.info(
      { uri, communityUri, authorDid, type: proposalType },
      'New proposal tracked',
    )
  }

  /**
   * Called when a vote is seen on the firehose.
   */
  async onVoteCast(
    uri: string,
    proposalUri: string,
    communityUri: string,
    voterDid: string,
    choice: string,
    createdAt: string,
  ): Promise<void> {
    const proposal = await this.db.getProposal(proposalUri)
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

    const constitution = await this.db.getConstitution(communityUri)
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

    await this.db.insertVote(
      uri,
      proposalUri,
      communityUri,
      voterDid,
      choice,
      weight,
      createdAt,
    )

    await this.chatMod.recordVote(voterDid, communityUri)

    // Recalculate running totals
    const votes = await this.db.getVotesForProposal(proposalUri)
    const forVotes = votes
      .filter((v: any) => v.choice === 'for')
      .reduce((sum: number, v: any) => sum + v.weight, 0)
    const againstVotes = votes
      .filter((v: any) => v.choice === 'against')
      .reduce((sum: number, v: any) => sum + v.weight, 0)
    const abstainVotes = votes
      .filter((v: any) => v.choice === 'abstain')
      .reduce((sum: number, v: any) => sum + v.weight, 0)

    await this.db.updateProposalVoteCounts(
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
    const deliberating = await this.db.getProposalsByState('deliberating')
    const communitiesWithActiveVoting = new Set<string>()

    // Pre-compute which communities already have a voting proposal
    const activeVoting = await this.db.getProposalsByState('voting')
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

      const constitution = await this.db.getConstitution(p.community_uri)
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
        await this.db.updateProposalState(p.uri, 'voting', now, votingEnds)
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
    const voting = await this.db.getProposalsByState('voting')
    for (const p of voting) {
      if (!p.voting_ends_at || now < p.voting_ends_at) continue

      const constitution = await this.db.getConstitution(p.community_uri)
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

      await this.db.finalizeProposal(p.uri, result, now)

      const budgetAllocated =
        result === 'approved' &&
        p.proposal_type === 'budget' &&
        p.budget_request
          ? p.budget_request
          : null

      await this.db.insertDecision(
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
    const space = await this.db.getSpaceForCommunity(communityUri)
    if (!space) return 0

    if (space.chamberMode === 'bicameral') {
      // Bicameral: only chamber members can vote
      const countA = await this.db.getChamberMemberCount(communityUri, 'A')
      const countB = await this.db.getChamberMemberCount(communityUri, 'B')
      return countA + countB
    }

    // Unicameral: count active community members
    return await this.db.getActiveMemberCount(communityUri)
  }

  private async announceInMatrix(
    communityUri: string,
    message: string,
  ): Promise<void> {
    const space = await this.db.getSpaceForCommunity(communityUri)
    if (!space?.spaceId) {
      this.log.warn(
        { communityUri },
        'No Matrix space for community, skipping announcement',
      )
      return
    }

    try {
      await this.matrix.sendEvent(
        space.spaceId,
        'm.room.message',
        { msgtype: 'm.text', body: message },
        { botUserId: this.matrix.botUserId },
      )
      this.log.info(
        { communityUri, roomId: space.spaceId },
        'Matrix announcement sent',
      )
    } catch (err) {
      this.log.warn(
        { err, communityUri, roomId: space.spaceId },
        'Failed to send Matrix announcement',
      )
    }
  }
}
