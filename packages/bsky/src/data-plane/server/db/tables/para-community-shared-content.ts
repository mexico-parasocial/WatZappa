export const tableName = 'para_community_shared_content'

export interface ParaCommunitySharedContent {
  uri: string
  cid: string
  creator: string
  rkey: string
  subjectUri: string
  subjectCid: string
  communityUri: string
  contentType: string
  sharedBy: string
  note: string | null
  visibility: string | null
  sourceApp: string | null
  embedContext: unknown | null
  pinned: boolean
  sortRank: number | null
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunitySharedContent
}
