// Plain host-internal member list, consulted at credential-mint time when a
// space's policy is 'member-list'. Not a synced protocol structure and not
// enumerated to the network.
export interface SimplespaceMember {
  space: string
  did: string
  read: 0 | 1
  write: 0 | 1
}

const tableName = 'simplespace_member'

export type PartialDB = { [tableName]: SimplespaceMember }
