export interface SpacePolicy {
  uri: string
  policyJson: string
}

export type PartialDB = { space_policy: SpacePolicy }
