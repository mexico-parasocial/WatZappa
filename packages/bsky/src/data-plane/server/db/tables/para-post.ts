import { GeneratedAlways } from 'kysely'

export const tableName = 'para_post'

export interface ParaPost {
  uri: string
  cid: string
  creator: string
  text: string
  replyRoot: string | null
  replyRootCid: string | null
  replyParent: string | null
  replyParentCid: string | null
  langs: string[] | null
  tags: string[] | null
  flairs: string[] | null
  postType: string | null
  party: string | null
  community: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: ParaPost
}
