export interface ParaSpacePolicyMember {
  space: string
  did: string
  membershipState: string
  // JSON-encoded arrays. The reader decodes them into PARA policy types.
  roles: string
  roleAssignments: string
  sourceVersion: number
  updatedAt: string
}

const tableName = 'para_space_policy_member'

export type PartialDB = { [tableName]: ParaSpacePolicyMember }
