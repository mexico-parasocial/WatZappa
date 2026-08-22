export interface SortitionStore {

  saveSortitionProof(proof: {
    did: string
    communityUri: string
    chamber: 'A' | 'B'
    drandRound: number
    drandRandomness: string
    hashInput: string
    hashOutput: string
    threshold: number
    timestamp: string
  }): Promise<void>

  getSortitionProof(did: string, communityUri: string): Promise<any | undefined>

  getSortitionProofsByCommunity(communityUri: string): Promise<any[]>

  getUnverifiedProofs(limit?: number): Promise<any[]>

  markProofVerified(id: number): Promise<void>

  getSortitionProofCount(): Promise<number>

  createSortitionRun(run: {
    id: string
    cabildeoUri: string
    communityUri: string
    createdByDid: string
    assemblySize: number
    eligibilityFilter: string
    drandRound: number
    configRecordJson: string
    createdAt: string
  }): Promise<any>

  getSortitionRun(id: string): Promise<any | undefined>

  getSortitionRunByCabildeo(cabildeoUri: string): Promise<any | undefined>

  getScheduledSortitionRuns(limit?: number): Promise<any[]>

  replaceSortitionCandidates(
    runId: string,
    candidates: Array<{
      did: string
      communityUri: string
      cabildeoUri: string
      hashInput: string
      hashOutput: string
      hashValue: number
      threshold: number
      selected: boolean
      createdAt: string
    }>,
  ): Promise<void>

  activateSortitionRun(run: {
    id: string
    drandRandomness: string
    threshold: number
    eligibleCount: number
    selectedCount: number
    processedAt: string
  }): Promise<any | undefined>

  failSortitionRun(id: string): Promise<void>

  getSortitionCandidates(runId: string, selectedOnly?: boolean): Promise<any[]>

  getSortitionCandidate(runId: string, did: string): Promise<any | undefined>
}
