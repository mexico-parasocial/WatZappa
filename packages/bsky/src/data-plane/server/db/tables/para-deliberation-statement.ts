import { GeneratedAlways } from 'kysely'

export const tableName = 'para_deliberation_statement'

export interface ParaDeliberationStatement {
  uri: string
  cid: string
  creator: string
  proposal: string
  community: string | null
  body: string
  stance: string | null
  createdAt: string
  indexedAt: string
  sortAt: GeneratedAlways<string>
}

export type PartialDB = {
  [tableName]: ParaDeliberationStatement
}
