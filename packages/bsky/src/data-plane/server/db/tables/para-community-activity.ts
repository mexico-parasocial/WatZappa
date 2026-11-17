export const activityTableName = 'para_community_activity'
export const ledgerEntryTableName = 'para_community_ledger_entry'
export const wikiPageTableName = 'para_community_wiki_page'
export const measurementTableName = 'para_community_activity_measurement'
export const acknowledgementTableName =
  'para_community_activity_acknowledgement'

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

/**
 * com.para.community.activityMeasurement records. Columns and `json` hold the
 * first indexed version; an edit only sets `edited`.
 */
export interface ParaCommunityActivityMeasurement {
  uri: string
  cid: string
  creator: string
  activityUri: string
  communityUri: string
  metric: string
  value: number
  measuredAt: string
  edited: boolean
  json: string
  indexedAt: string
}

/**
 * com.para.community.activityAcknowledgement records. Columns and `json` hold
 * the first indexed version; an edit only sets `edited`.
 */
export interface ParaCommunityActivityAcknowledgement {
  uri: string
  cid: string
  creator: string
  activityUri: string
  communityUri: string
  subjectUri: string
  subjectCid: string
  role: string
  response: string
  occurredAt: string
  edited: boolean
  json: string
  indexedAt: string
}

export type PartialDB = {
  [activityTableName]: ParaCommunityActivity
  [ledgerEntryTableName]: ParaCommunityLedgerEntry
  [wikiPageTableName]: ParaCommunityWikiPage
  [measurementTableName]: ParaCommunityActivityMeasurement
  [acknowledgementTableName]: ParaCommunityActivityAcknowledgement
}
