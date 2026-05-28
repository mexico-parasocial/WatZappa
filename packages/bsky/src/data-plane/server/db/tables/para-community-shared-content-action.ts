export const tableName = 'para_community_shared_content_action'

export interface ParaCommunitySharedContentAction {
  uri: string
  cid: string
  creator: string
  rkey: string
  sharedContentUri: string
  sharedContentCid: string
  communityUri: string
  action: string
  note: string | null
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunitySharedContentAction
}
