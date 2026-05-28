import { GeneratedAlways } from 'kysely'

export const tableName = 'raq_assessment'

export interface Main {
  uri: string
  cid: string
  creator: string
  answersJson: string | null
  resultsJson: string | null
  compassJson: string | null
  ideologyJson: string | null
  secondaryIdeologyJson: string | null
  partyMatchesJson: string | null
  isPublic: boolean
  completedAt: string
  version: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: Main
}
