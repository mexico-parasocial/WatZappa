export const tableName = 'para_post_meta'

export interface ParaPostMeta {
  uri: string
  cid: string
  creator: string
  postUri: string
  postType: string
  official: boolean | null
  party: string | null
  community: string | null
  category: string | null
  tags: string[] | null
  flairs: string[] | null
  voteScore: number
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaPostMeta
}
