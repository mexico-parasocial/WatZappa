export interface ConstitutionProposalsStore {

  setConstitution(
    communityUri: string,
    version: number,
    rulesJson: string,
  ): Promise<void>

  getConstitution(communityUri: string): Promise<
    | {
        communityUri: string
        version: number
        rulesJson: string
        createdAt: string
      }
    | undefined
  >

  insertProposal(
    uri: string,
    communityUri: string,
    authorDid: string,
    title: string,
    body: string,
    proposalType: string,
    budgetRequest: number | null,
    createdAt: string,
  ): Promise<void>

  getProposal(uri: string): Promise<any | undefined>

  getProposalsByCommunity(communityUri: string, state?: string): Promise<any[]>

  getProposalsByState(state: string): Promise<any[]>

  updateProposalState(
    uri: string,
    state: string,
    votingStartsAt?: string,
    votingEndsAt?: string,
  ): Promise<void>

  updateProposalVoteCounts(
    uri: string,
    forVotes: number,
    againstVotes: number,
    abstainVotes: number,
  ): Promise<void>

  finalizeProposal(
    uri: string,
    result: string,
    decidedAt: string,
  ): Promise<void>

  insertVote(
    uri: string,
    proposalUri: string,
    communityUri: string,
    voterDid: string,
    choice: string,
    weight: number,
    createdAt: string,
  ): Promise<void>

  getVotesForProposal(proposalUri: string): Promise<any[]>

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
  ): Promise<void>

  getDecision(proposalUri: string): Promise<any | undefined>

  getDecisionsByCommunity(communityUri: string): Promise<any[]>
}
