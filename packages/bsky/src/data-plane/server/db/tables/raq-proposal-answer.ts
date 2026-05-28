import { GeneratedAlways } from 'kysely'

export const tableName = 'raq_proposal_answer'

export interface Main {
  uri: string
  cid: string
  creator: string
  subject: string
  value: number
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: Main
}
