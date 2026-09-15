export interface ParaSpacePolicyFault {
  space: string
  sourceIssuer: string
  sourceUri: string
  maxSourceVersion: number
  maxPolicyEpoch: number
  versionEvidence: string
  epochEvidence: string
  observedAt: string
}

export type PartialDB = { para_space_policy_fault: ParaSpacePolicyFault }
