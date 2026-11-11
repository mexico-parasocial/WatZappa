export const followThroughTableName = 'para_follow_through'
export const followThroughUpdateTableName = 'para_follow_through_update'
export const followThroughCommitTableName = 'para_follow_through_commit'

/** com.para.civic.followThrough records, with their committed values. */
export interface ParaFollowThrough {
  uri: string
  cid: string
  creator: string
  cabildeo: string
  communityUri: string
  optionIndex: number
  parent: string | null
  title: string
  summary: string | null
  responsibleDid: string | null
  responsibleLabel: string | null
  dueAt: string | null
  /** The record was changed after it was first indexed. */
  edited: boolean
  createdAt: string
  indexedAt: string
}

/** com.para.civic.followThroughUpdate records, with their committed values. */
export interface ParaFollowThroughUpdate {
  uri: string
  cid: string
  creator: string
  subject: string
  status: string
  progress: number | null
  note: string | null
  /** JSON array of URIs. */
  evidenceUris: string
  dueAt: string | null
  edited: boolean
  occurredAt: string
  createdAt: string
  indexedAt: string
}

/**
 * The first version of every item, update and conclusion, kept even after the record is
 * deleted or edited. Edits are served as the committed version flagged
 * `edited`; a commit row with no live record is a withdrawn update.
 */
export interface ParaFollowThroughCommit {
  uri: string
  kind: 'item' | 'update' | 'conclusion'
  /** The cabildeo for an item, the item for an update. */
  subject: string
  creator: string
  digest: string
  json: string
  indexedAt: string
}

export type PartialDB = {
  [followThroughTableName]: ParaFollowThrough
  [followThroughUpdateTableName]: ParaFollowThroughUpdate
  [followThroughCommitTableName]: ParaFollowThroughCommit
}
