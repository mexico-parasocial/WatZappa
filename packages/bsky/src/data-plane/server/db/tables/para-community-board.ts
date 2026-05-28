export const tableName = 'para_community_board'

export interface ParaCommunityBoard {
  uri: string
  cid: string
  creator: string
  rkey: string
  name: string
  description: string | null
  quadrant: string
  slug: string
  delegatesChatId: string
  subdelegatesChatId: string
  governanceMode: string | null
  createdAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityBoard
}
