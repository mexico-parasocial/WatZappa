import { GeneratedAlways } from 'kysely'

export const tableName = 'raq_proposal'

export interface Main {
  uri: string
  cid: string
  creator: string
  text: string
  targetAxis: string | null
  targetCommunity: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: Main
}
