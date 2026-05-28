import { ColumnType } from 'kysely'

export const tableName = 'para_community_membership'

export interface ParaCommunityMembership {
  uri: string
  cid: string
  creator: string
  communityUri: string
  membershipState: string
  roles: ColumnType<string[] | null, string[] | null, string[] | null>
  roleAssignments: ColumnType<
    Record<string, unknown>[] | null,
    Record<string, unknown>[] | null,
    Record<string, unknown>[] | null
  >
  source: string | null
  joinedAt: string
  leftAt: string | null
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityMembership
}
