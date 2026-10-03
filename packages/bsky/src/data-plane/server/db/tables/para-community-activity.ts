export const activityTableName = 'para_community_activity'
export const ledgerEntryTableName = 'para_community_ledger_entry'
export const wikiPageTableName = 'para_community_wiki_page'

/** com.para.community.socialActivity and economicActivity records. */
export interface ParaCommunityActivity {
  uri: string
  cid: string
  creator: string
  communityUri: string
  category: 'social' | 'economic'
  /** The details union member, e.g. `peacefulMarch` or `raffle`. */
  kind: string
  title: string
  status: string
  startsAt: string
  endsAt: string | null
  json: string
  createdAt: string
  indexedAt: string
}

/** com.para.community.activityLedgerEntry records. */
export interface ParaCommunityLedgerEntry {
  uri: string
  cid: string
  creator: string
  activityUri: string
  communityUri: string
  entryType: string
  amountMinor: number
  currency: string
  occurredAt: string
  json: string
  createdAt: string
  indexedAt: string
}

/** com.para.community.wikiPage records. */
export interface ParaCommunityWikiPage {
  uri: string
  cid: string
  creator: string
  communityUri: string
  kind: string
  slug: string
  title: string
  pinned: boolean
  sortOrder: number | null
  json: string
  updatedAt: string
  indexedAt: string
}

export type PartialDB = {
  [activityTableName]: ParaCommunityActivity
  [ledgerEntryTableName]: ParaCommunityLedgerEntry
  [wikiPageTableName]: ParaCommunityWikiPage
}
