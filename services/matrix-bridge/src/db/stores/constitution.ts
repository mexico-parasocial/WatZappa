export interface ConstitutionStore {
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
}
