import { ColumnType } from 'kysely'

export const tableName = 'para_community_briefing_pack'

export interface ParaCommunityBriefingPack {
  uri: string
  cid: string
  creator: string
  rkey: string
  packType: string
  communityUri: string
  party: string
  title: string
  summary: string
  cabildeoUris: ColumnType<string[], string[], string[]>
  civicTreeCardIds: ColumnType<string[], string[], string[]>
  evidenceUris: ColumnType<string[], string[], string[]>
  sembleCollectionUri: string | null
  marginCollectionUri: string | null
  obsidianExportUri: string | null
  status: string
  createdBy: string
  createdAt: string
  updatedAt: string
  indexedAt: string
}

export type PartialDB = {
  [tableName]: ParaCommunityBriefingPack
}
